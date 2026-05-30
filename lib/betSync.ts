import { getAddress } from "viem";
import type { Bet } from "@prisma/client";

import { prisma } from "@/lib/db";
import { readBetV2 } from "@/lib/onchain";
import { reconcileSettledBetProposals } from "@/lib/resolutionReconcile";

const ZERO = "0x0000000000000000000000000000000000000000";

// Bets that have reached a final state never change again on-chain.
const TERMINAL = new Set(["Settled", "Cancelled", "Refunded"]);

// In-memory throttle so a single bet is read from chain at most once per window
// no matter how many list/feed requests arrive — keeps RPC usage bounded while
// still letting status (e.g. Open -> Matched) propagate to the UI quickly.
const lastSync = new Map<number, number>();
const SYNC_THROTTLE_MS = 2_000;

function chainStatusFromOnchain(
  onchain: NonNullable<Awaited<ReturnType<typeof readBetV2>>>,
): string {
  if (
    onchain.status === "Open" &&
    onchain.acceptor &&
    onchain.acceptor !== ZERO
  ) {
    return "Matched";
  }
  return onchain.status;
}

/** Wrongly synced to Cancelled while swapping in negotiated on-chain stakes. */
async function healEscrowRevisionStatus(bet: Bet): Promise<Bet> {
  if (!bet.escrowRevisionNeeded || bet.status !== "Cancelled") return bet;
  try {
    await prisma.bet.update({ where: { id: bet.id }, data: { status: "Open" } });
    bet.status = "Open";
  } catch (err) {
    console.warn("escrow revision status heal failed", err);
  }
  return bet;
}

/**
 * Opportunistically sync a single bet's mutable on-chain state (status,
 * acceptor, winner) into the DB. Lightweight (no notifications) and safe to call
 * from list endpoints. Returns the (possibly mutated) bet row.
 */
export async function syncBetOnchain(
  bet: Bet,
  opts: { force?: boolean } = {},
): Promise<Bet> {
  // Old onchainId is intentionally cancelled during negotiated escrow refresh;
  // syncing it would mark the indexed bet Cancelled before the new offer lands.
  if (bet.escrowRevisionNeeded) {
    return healEscrowRevisionStatus(bet);
  }
  if (TERMINAL.has(bet.status)) return bet;

  const now = Date.now();
  if (!opts.force && bet.status !== "Open" && bet.status !== "Matched") {
    const last = lastSync.get(bet.id) ?? 0;
    if (now - last < SYNC_THROTTLE_MS) return bet;
  }
  lastSync.set(bet.id, now);

  const onchain = await readBetV2(
    bet.chainId,
    getAddress(bet.escrowAddress) as `0x${string}`,
    BigInt(bet.onchainId),
  ).catch(() => null);
  if (!onchain) return bet;

  const updates: Record<string, unknown> = {};
  const syncedStatus = chainStatusFromOnchain(onchain);
  if (syncedStatus !== bet.status) updates.status = syncedStatus;
  if (
    onchain.acceptor &&
    onchain.acceptor !== ZERO &&
    onchain.acceptor.toLowerCase() !== (bet.acceptor || "").toLowerCase()
  ) {
    updates.acceptor = getAddress(onchain.acceptor);
  }
  if (onchain.status === "Settled") {
    const win = onchain.winningOutcome;
    if (bet.winningOutcome !== win) updates.winningOutcome = win;
    const winnerAddr =
      win === onchain.proposerOutcome
        ? getAddress(onchain.proposer)
        : win === onchain.acceptorOutcome && onchain.acceptor !== ZERO
          ? getAddress(onchain.acceptor)
          : null;
    if ((bet.winner || null) !== winnerAddr) updates.winner = winnerAddr;
  }

  if (Object.keys(updates).length > 0) {
    try {
      await prisma.bet.update({ where: { id: bet.id }, data: updates });
      Object.assign(bet, updates);
    } catch (err) {
      console.warn("bet list sync failed", err);
    }
  }

  if (onchain.status === "Settled") {
    await reconcileSettledBetProposals(bet.id, onchain.winningOutcome).catch(
      () => {},
    );
  }

  return bet;
}

/** Sync many bets in parallel (terminal skipped; Open/Matched always refreshed). */
export async function syncBetsOnchain(bets: Bet[], cap = 60): Promise<Bet[]> {
  let budget = cap;
  return Promise.all(
    bets.map((b) => {
      if (TERMINAL.has(b.status)) return b;
      if (budget <= 0) return b;
      budget -= 1;
      return syncBetOnchain(b);
    }),
  );
}
