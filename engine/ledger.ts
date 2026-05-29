/**
 * Durable double-entry ledger on Postgres. The matching engine is the single
 * writer; every economic event is applied atomically with its journal lines.
 *
 * All amounts are integer micro-units (BigInt). Accounts carry `balance` (free)
 * and `locked` (reserved by resting orders / pending withdrawals).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import type { AccountDelta, FillPlan } from "../lib/exchange/types";
import {
  collateralKey,
  feeKey,
  parseKey,
  reserveKey,
  shareKey,
} from "../lib/exchange/keys";

type Tx = Prisma.TransactionClient;

/** Upsert an account by key and apply signed balance/locked deltas; return id. */
async function applyDelta(tx: Tx, d: AccountDelta): Promise<number> {
  const p = parseKey(d.key);
  const row = await tx.account.upsert({
    where: { key: d.key },
    update: {
      balance: { increment: d.balanceDelta },
      locked: { increment: d.lockedDelta },
    },
    create: {
      key: d.key,
      owner: p.owner,
      kind: p.kind,
      marketId: p.marketId,
      outcomeIndex: p.outcomeIndex,
      balance: d.balanceDelta,
      locked: d.lockedDelta,
    },
    select: { id: true },
  });
  return row.id;
}

async function writeJournal(
  tx: Tx,
  type: string,
  refId: string | null,
  marketId: number | null,
  deltas: AccountDelta[],
): Promise<void> {
  if (deltas.length === 0) return;
  const lines: { accountId: number; balanceDelta: bigint; lockedDelta: bigint }[] = [];
  for (const d of deltas) {
    const accountId = await applyDelta(tx, d);
    lines.push({ accountId, balanceDelta: d.balanceDelta, lockedDelta: d.lockedDelta });
  }
  await tx.ledgerTx.create({
    data: { type, refId, marketId, lines: { create: lines } },
  });
}

export type StatUpdate = {
  outcomeIndex: number;
  bestBid: bigint | null;
  bestAsk: bigint | null;
  lastPrice?: bigint | null;
};

export class Ledger {
  constructor(private prisma: PrismaClient) {}

  /** Read a user's free + locked collateral balance (micro-USDC). */
  async getCollateral(address: string): Promise<{ balance: bigint; locked: bigint }> {
    const a = await this.prisma.account.findUnique({
      where: { key: collateralKey(address) },
      select: { balance: true, locked: true },
    });
    return { balance: a?.balance ?? 0n, locked: a?.locked ?? 0n };
  }

  /** Read a user's share balances across all markets (or one market). */
  async getShares(
    address: string,
    marketId?: number,
  ): Promise<{ marketId: number; outcomeIndex: number; balance: bigint; locked: bigint }[]> {
    const rows = await this.prisma.account.findMany({
      where: {
        owner: address.toLowerCase(),
        kind: "SHARE",
        ...(marketId != null ? { marketId } : {}),
      },
      select: { marketId: true, outcomeIndex: true, balance: true, locked: true },
    });
    return rows.map((r) => ({
      marketId: r.marketId!,
      outcomeIndex: r.outcomeIndex!,
      balance: r.balance,
      locked: r.locked,
    }));
  }

  /**
   * Apply a matched order: account deltas + journal + fill rows + book stats,
   * all in one transaction. Returns nothing; throws on failure (engine must not
   * then mutate its in-memory book).
   */
  async applyMatch(args: {
    marketId: number;
    taker: string;
    feeBps: number;
    deltas: AccountDelta[];
    fills: FillPlan[];
    stats: StatUpdate[];
  }): Promise<void> {
    const { marketId, taker, feeBps, deltas, fills, stats } = args;
    await this.prisma.$transaction(async (tx) => {
      await writeJournal(tx, "TRADE", null, marketId, deltas);

      for (const f of fills) {
        const takerFee = (f.takerCost * BigInt(Math.round(feeBps))) / 10_000n;
        await tx.fill.create({
          data: {
            marketId,
            matchType: f.matchType,
            qty: f.qty,
            price: f.takerPrice,
            taker: taker.toLowerCase(),
            takerSide: f.takerSide,
            takerOutcome: f.takerOutcome,
            takerCost: f.takerCost,
            takerFee,
            maker: f.maker,
            makerOrderId: f.makerOrderId,
            makerSide: f.makerSide,
            makerOutcome: f.makerOutcome,
            makerCost: f.makerCost,
          },
        });
      }

      for (const s of stats) {
        await tx.outcomeStat.upsert({
          where: { marketId_outcomeIndex: { marketId, outcomeIndex: s.outcomeIndex } },
          update: {
            bestBid: s.bestBid,
            bestAsk: s.bestAsk,
            ...(s.lastPrice !== undefined ? { lastPrice: s.lastPrice } : {}),
          },
          create: {
            marketId,
            outcomeIndex: s.outcomeIndex,
            bestBid: s.bestBid,
            bestAsk: s.bestAsk,
            lastPrice: s.lastPrice ?? null,
          },
        });
      }
    });
  }

  /** Refund a cancelled resting order's lock (BUY -> collateral, SELL -> shares). */
  async refundLock(args: {
    marketId: number;
    owner: string;
    side: "BUY" | "SELL";
    outcomeIndex: number;
    amount: bigint; // micro-units of collateral (BUY) or shares (SELL)
    refId?: string;
  }): Promise<void> {
    if (args.amount <= 0n) return;
    const key =
      args.side === "BUY"
        ? collateralKey(args.owner)
        : shareKey(args.owner, args.marketId, args.outcomeIndex);
    const deltas: AccountDelta[] = [
      { key, balanceDelta: args.amount, lockedDelta: -args.amount },
    ];
    await this.prisma.$transaction(async (tx) => {
      await writeJournal(tx, "CANCEL", args.refId ?? null, args.marketId, deltas);
    });
  }

  /** Credit an on-chain deposit. Idempotent per (txHash, logIndex). */
  async creditDeposit(args: {
    address: string;
    amount: bigint;
    txHash: string;
    logIndex: number;
    chainId: number;
  }): Promise<boolean> {
    const addr = args.address.toLowerCase();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.deposit.create({
          data: {
            address: addr,
            amount: args.amount,
            txHash: args.txHash,
            logIndex: args.logIndex,
            chainId: args.chainId,
          },
        });
        await writeJournal(tx, "DEPOSIT", args.txHash, null, [
          { key: collateralKey(addr), balanceDelta: args.amount, lockedDelta: 0n },
        ]);
      });
      return true;
    } catch (err: unknown) {
      // Unique violation => already credited. Treat as no-op.
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Reserve a withdrawal: move (amount + fee) from free collateral to locked and
   * create a Withdrawal row. Throws if the free balance is insufficient.
   */
  async requestWithdrawal(args: {
    address: string;
    amount: bigint;
    fee: bigint;
    status: string;
  }): Promise<{ id: number }> {
    const addr = args.address.toLowerCase();
    const total = args.amount + args.fee;
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.account.findUnique({
        where: { key: collateralKey(addr) },
        select: { balance: true },
      });
      if (!a || a.balance < total) throw new Error("insufficient balance");
      const w = await tx.withdrawal.create({
        data: {
          address: addr,
          amount: args.amount,
          fee: args.fee,
          status: args.status,
        },
        select: { id: true },
      });
      await writeJournal(tx, "WITHDRAWAL", String(w.id), null, [
        { key: collateralKey(addr), balanceDelta: -total, lockedDelta: total },
      ]);
      return w;
    });
  }

  /** Finalize a sent withdrawal: locked funds leave the system; fee -> house. */
  async completeWithdrawal(id: number, txHash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id } });
      if (!w || (w.status !== "Processing" && w.status !== "Pending" && w.status !== "Review")) {
        throw new Error("withdrawal not in a completable state");
      }
      const total = w.amount + w.fee;
      const deltas: AccountDelta[] = [
        { key: collateralKey(w.address), balanceDelta: 0n, lockedDelta: -total },
      ];
      if (w.fee > 0n) deltas.push({ key: feeKey(), balanceDelta: w.fee, lockedDelta: 0n });
      await writeJournal(tx, "WITHDRAWAL", String(id), null, deltas);
      await tx.withdrawal.update({
        where: { id },
        data: { status: "Sent", txHash },
      });
    });
  }

  /** Refund a failed/rejected withdrawal back to the user's free balance. */
  async failWithdrawal(id: number, error: string, status = "Failed"): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id } });
      if (!w) throw new Error("withdrawal not found");
      if (w.status === "Sent") throw new Error("already sent");
      const total = w.amount + w.fee;
      await writeJournal(tx, "WITHDRAWAL", String(id), null, [
        { key: collateralKey(w.address), balanceDelta: total, lockedDelta: -total },
      ]);
      await tx.withdrawal.update({ where: { id }, data: { status, error } });
    });
  }

  /**
   * Redeem shares after a market resolves. Winning outcome shares pay 1:1 into
   * collateral; losing shares are zeroed; the reserve is drained. Resting-order
   * lock refunds must be done first by the caller (the engine cancels the book).
   */
  async settleMarket(marketId: number, winningOutcome: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const shares = await tx.account.findMany({
        where: { kind: "SHARE", marketId },
        select: { id: true, owner: true, outcomeIndex: true, balance: true, locked: true },
      });
      const deltas: AccountDelta[] = [];
      let totalPayout = 0n;
      for (const s of shares) {
        const held = s.balance + s.locked;
        if (held === 0n) continue;
        // Zero out the share account.
        deltas.push({
          key: shareKey(s.owner, marketId, s.outcomeIndex!),
          balanceDelta: -s.balance,
          lockedDelta: -s.locked,
        });
        if (s.outcomeIndex === winningOutcome) {
          deltas.push({
            key: collateralKey(s.owner),
            balanceDelta: held,
            lockedDelta: 0n,
          });
          totalPayout += held;
        }
      }
      // Drain reserve (should equal totalPayout for binary markets).
      const reserve = await tx.account.findUnique({
        where: { key: reserveKey(marketId) },
        select: { balance: true },
      });
      if (reserve && reserve.balance !== 0n) {
        deltas.push({ key: reserveKey(marketId), balanceDelta: -reserve.balance, lockedDelta: 0n });
      }
      await writeJournal(tx, "SETTLEMENT", `market:${marketId}:${winningOutcome}`, marketId, deltas);
    });
  }

  /**
   * Binary solvency invariant: outstanding YES == outstanding NO == reserve.
   * Also verifies no negative balances. Throws on violation.
   */
  async assertSolvency(marketId: number, numOutcomes: number): Promise<void> {
    const rows = await this.prisma.account.findMany({
      where: { marketId, kind: { in: ["SHARE", "RESERVE"] } },
      select: { kind: true, outcomeIndex: true, balance: true, locked: true },
    });
    const outstanding = new Array(numOutcomes).fill(0n) as bigint[];
    let reserve = 0n;
    for (const r of rows) {
      if (r.balance < 0n || r.locked < 0n) {
        throw new Error(`negative balance in market ${marketId}`);
      }
      if (r.kind === "RESERVE") reserve += r.balance + r.locked;
      else if (r.outcomeIndex != null) outstanding[r.outcomeIndex] += r.balance + r.locked;
    }
    if (numOutcomes === 2) {
      if (outstanding[0] !== outstanding[1]) {
        throw new Error(
          `solvency: YES(${outstanding[0]}) != NO(${outstanding[1]}) in market ${marketId}`,
        );
      }
      if (outstanding[0] !== reserve) {
        throw new Error(
          `solvency: outstanding(${outstanding[0]}) != reserve(${reserve}) in market ${marketId}`,
        );
      }
    }
  }
}
