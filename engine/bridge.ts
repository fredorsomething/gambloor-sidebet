/**
 * On-chain deposit/withdraw bridge for the custodial exchange.
 *
 * Deposits: polls USDC.e Transfer logs into the treasury wallet and credits the
 * sender's collateral balance (idempotent per txHash+logIndex).
 *
 * Withdrawals: processes Pending withdrawal rows by sending USDC.e from the
 * treasury hot wallet and recording the tx. Amounts at/above WITHDRAWAL_AUTO_LIMIT
 * are left in "Review" by the API and skipped here for manual approval.
 *
 * USDC.e on Polygon has 6 decimals, so on-chain units equal our internal
 * micro-units exactly (no scaling needed).
 */
import type { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { Ledger } from "./ledger";

const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;
const CHAIN_ID = 137;
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const RPC = process.env.NEXT_PUBLIC_POLYGON_RPC || "https://polygon-bor-rpc.publicnode.com";
const TREASURY_KEY = process.env.TREASURY_PRIVATE_KEY?.trim();
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS?.trim();
const AUTO_LIMIT = BigInt(process.env.WITHDRAWAL_AUTO_LIMIT || "0");
// Some public RPCs (e.g. publicnode) heavily restrict eth_getLogs; allow tuning
// the per-request block range and initial lookback via env. A dedicated RPC
// (Alchemy/Infura) is strongly recommended in production.
const MAX_BLOCK_RANGE = BigInt(process.env.BRIDGE_BLOCK_RANGE || "500");
const DEPOSIT_LOOKBACK = BigInt(process.env.BRIDGE_LOOKBACK_BLOCKS || "2000");
const POLL_MS = 15_000;
// Funds are never held custodially: any free collateral (order-cancel refunds,
// sell proceeds, price-improvement leftovers, settlement winnings) is swept back
// to the user's wallet automatically. Skip dust below this to avoid gas waste.
const SWEEP_MIN = BigInt(process.env.SWEEP_MIN_MICRO || "10000"); // 0.01 USDC.e

export class Bridge {
  private ledger: Ledger;
  private publicClient = createPublicClient({ chain: polygon, transport: http(RPC) });
  private lastBlock = 0n;
  private running = false;
  private depositErrorCount = 0;

  constructor(private prisma: PrismaClient) {
    this.ledger = new Ledger(prisma);
  }

  start() {
    if (!TREASURY_ADDRESS) {
      console.warn("[bridge] NEXT_PUBLIC_TREASURY_ADDRESS not set; bridge disabled");
      return;
    }
    this.running = true;
    void this.loop();
    console.log(`[bridge] started; treasury=${TREASURY_ADDRESS}`);
  }

  stop() {
    this.running = false;
  }

  private async loop() {
    while (this.running) {
      try {
        await this.scanDeposits();
        await this.sweepBalances();
        await this.processWithdrawals();
      } catch (err) {
        console.error("[bridge] loop error", err);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  /**
   * Sweep every user's free collateral back to their wallet. This keeps the
   * model fully wallet-centric: nothing sits idle in the exchange. Locked funds
   * (resting orders, in-flight withdrawals) are untouched — only free `balance`
   * is swept, so re-running is safe and idempotent.
   */
  private async sweepBalances() {
    if (!TREASURY_KEY) return;
    const accounts = await this.prisma.account.findMany({
      where: { kind: "COLLATERAL", balance: { gt: SWEEP_MIN } },
      select: { owner: true, balance: true },
      take: 50,
    });
    for (const a of accounts) {
      if (!a.owner || !a.owner.startsWith("0x")) continue;
      try {
        await this.ledger.requestWithdrawal({
          address: a.owner,
          amount: a.balance,
          fee: 0n,
          status: "Pending",
        });
        console.log(`[bridge] sweep ${a.balance} -> ${a.owner}`);
      } catch (err) {
        // A concurrent order may have locked the balance first; skip and retry.
        const msg = err instanceof Error ? err.message : "sweep failed";
        if (!msg.includes("insufficient")) {
          console.warn(`[bridge] sweep for ${a.owner} failed: ${msg}`);
        }
      }
    }
  }

  private async scanDeposits() {
    if (!TREASURY_ADDRESS) return;
    const treasury = getAddress(TREASURY_ADDRESS);
    const latest = await this.publicClient.getBlockNumber();
    if (this.lastBlock === 0n) {
      // Start a little behind the tip on first run.
      this.lastBlock = latest > DEPOSIT_LOOKBACK ? latest - DEPOSIT_LOOKBACK : 0n;
    }
    let from = this.lastBlock + 1n;
    while (from <= latest) {
      const to = from + MAX_BLOCK_RANGE - 1n > latest ? latest : from + MAX_BLOCK_RANGE - 1n;
      let logs;
      try {
        logs = await this.publicClient.getLogs({
          address: USDCE_ADDRESS,
          event: TRANSFER_EVENT,
          args: { to: treasury },
          fromBlock: from,
          toBlock: to,
        });
      } catch (err) {
        // Public RPCs often reject getLogs. Don't advance (so we retry the
        // range next cycle) and throttle the noise to roughly once a minute.
        this.depositErrorCount++;
        if (this.depositErrorCount === 1 || this.depositErrorCount % 4 === 0) {
          const msg = err instanceof Error ? err.message.split("\n")[0] : "getLogs failed";
          console.warn(
            `[bridge] deposit scan failed (blocks ${from}-${to}): ${msg}. ` +
              `Set NEXT_PUBLIC_POLYGON_RPC to a provider that supports eth_getLogs (Alchemy/Infura).`,
          );
        }
        return;
      }
      this.depositErrorCount = 0;
      for (const log of logs) {
        const sender = log.args.from as Address | undefined;
        const value = log.args.value as bigint | undefined;
        if (!sender || value == null || value <= 0n) continue;
        const credited = await this.ledger.creditDeposit({
          address: sender.toLowerCase(),
          amount: value,
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
          chainId: CHAIN_ID,
        });
        if (credited) {
          console.log(`[bridge] deposit ${value} from ${sender} (${log.transactionHash})`);
        }
      }
      this.lastBlock = to;
      from = to + 1n;
    }
  }

  private async processWithdrawals() {
    if (!TREASURY_KEY) return;
    const pending = await this.prisma.withdrawal.findMany({
      where: { status: "Pending" },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (pending.length === 0) return;

    const account = privateKeyToAccount(TREASURY_KEY as Hex);
    const wallet = createWalletClient({ account, chain: polygon, transport: http(RPC) });

    for (const w of pending) {
      if (AUTO_LIMIT > 0n && w.amount + w.fee >= AUTO_LIMIT) {
        await this.prisma.withdrawal.update({
          where: { id: w.id },
          data: { status: "Review" },
        });
        continue;
      }
      await this.prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: "Processing" },
      });
      try {
        const hash = await wallet.writeContract({
          address: USDCE_ADDRESS,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [getAddress(w.address), w.amount],
        });
        await this.publicClient.waitForTransactionReceipt({ hash });
        await this.ledger.completeWithdrawal(w.id, hash);
        console.log(`[bridge] withdrawal #${w.id} sent ${w.amount} to ${w.address} (${hash})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        console.error(`[bridge] withdrawal #${w.id} failed`, message);
        await this.ledger.failWithdrawal(w.id, message).catch((e) => {
          console.error("[bridge] refund failed", e);
        });
      }
    }
  }
}
