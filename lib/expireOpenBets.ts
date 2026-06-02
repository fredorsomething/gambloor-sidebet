/**
 * Auto-expire open sidebets past their accept deadline: calls `expireOpenBet`
 * on-chain (refunds proposer stake) and marks the indexed bet as Expired.
 *
 * Uses SETTLER_PRIVATE_KEY / AUTO_SETTLE_PRIVATE_KEY — any funded wallet works
 * because `expireOpenBet` is permissionless once the deadline passes.
 */
import { getAddress, type Address, type Hex } from "viem";
import { polygon } from "viem/chains";

import { SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { autoSettleEnabled, getKeeperWallet } from "@/lib/autoSettle";
import { prisma } from "@/lib/db";
import { readBetV2 } from "@/lib/onchain";
import { applyBetOnchainSync } from "@/lib/betSync";
import {
  effectiveAcceptDeadlineSec,
  isAcceptWindowExpired,
} from "@/lib/sidebetExpiry";

const RETRY_COOLDOWN_MS = 30_000;
const lastAttemptAt = new Map<number, number>();

export type ExpireOpenBetResult =
  | { ok: true; hash: Hex; betId: number }
  | { ok: false; betId: number; reason: string };

export function expireOpenBetsEnabled(): boolean {
  return autoSettleEnabled();
}

export async function tryExpireOpenBet(
  betId: number,
  opts: { force?: boolean } = {},
): Promise<ExpireOpenBetResult> {
  if (!opts.force) {
    const last = lastAttemptAt.get(betId) ?? 0;
    if (Date.now() - last < RETRY_COOLDOWN_MS) {
      return { ok: false, betId, reason: "retry cooldown" };
    }
  }
  lastAttemptAt.set(betId, Date.now());

  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) return { ok: false, betId, reason: "bet not found" };

  if (bet.status === "Expired") {
    return { ok: true, hash: "0x" as Hex, betId };
  }

  if (bet.status !== "Open") {
    return { ok: false, betId, reason: `status is ${bet.status}` };
  }

  if (!isAcceptWindowExpired(bet, bet.status)) {
    return { ok: false, betId, reason: "accept window not expired" };
  }

  if (effectiveAcceptDeadlineSec(bet) == null) {
    return { ok: false, betId, reason: "no accept deadline" };
  }

  const keeper = getKeeperWallet();
  if (!keeper) {
    return { ok: false, betId, reason: "keeper private key not configured" };
  }

  const onchain = await readBetV2(
    bet.chainId,
    getAddress(bet.escrowAddress) as Address,
    BigInt(bet.onchainId),
  );
  if (!onchain) {
    return { ok: false, betId, reason: "on-chain read failed" };
  }

  if (onchain.status === "Cancelled" || onchain.status === "Refunded") {
    await prisma.bet.update({
      where: { id: bet.id },
      data: { status: "Expired" },
    });
    return { ok: true, hash: "0x" as Hex, betId };
  }

  if (onchain.status !== "Open") {
    return { ok: false, betId, reason: `on-chain status is ${onchain.status}` };
  }

  if (onchain.acceptor && onchain.acceptor !== "0x0000000000000000000000000000000000000000") {
    return { ok: false, betId, reason: "already has acceptor on-chain" };
  }

  try {
    const hash = await keeper.wallet.writeContract({
      account: keeper.account,
      chain: polygon,
      address: getAddress(bet.escrowAddress) as Address,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "expireOpenBet",
      args: [BigInt(bet.onchainId)],
    });
    await keeper.publicClient.waitForTransactionReceipt({ hash });

    const onchainAfter = await readBetV2(
      bet.chainId,
      getAddress(bet.escrowAddress) as Address,
      BigInt(bet.onchainId),
    );
    if (onchainAfter) {
      await applyBetOnchainSync(bet, onchainAfter);
    }
    await prisma.bet.update({
      where: { id: bet.id },
      data: { status: "Expired" },
    });

    console.log(`expire-open-bet: bet #${betId} expired tx=${hash}`);
    return { ok: true, hash, betId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "expireOpenBet failed";
    console.error(`expire-open-bet: bet #${betId} failed`, reason);
    return { ok: false, betId, reason };
  }
}

/** Scan open bets past accept deadline and refund proposer stakes on-chain. */
export async function expireEligibleOpenBets(): Promise<ExpireOpenBetResult[]> {
  if (!expireOpenBetsEnabled()) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  const bets = await prisma.bet.findMany({
    where: {
      status: "Open",
      acceptDeadline: { not: null, lt: BigInt(nowSec) },
    },
    orderBy: { acceptDeadline: "asc" },
    take: 40,
  });

  const results: ExpireOpenBetResult[] = [];
  for (const { id } of bets) {
    results.push(await tryExpireOpenBet(id, { force: true }));
  }
  return results;
}
