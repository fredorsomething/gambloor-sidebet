import { getAddress } from "viem";
import type { Bet } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notifications";
import { readBetV2, type OnchainBetV2 } from "@/lib/onchain";
import { reconcileSettledBetProposals } from "@/lib/resolutionReconcile";

const ZERO = "0x0000000000000000000000000000000000000000";

// Bets that have reached a final state never change again on-chain.
const TERMINAL = new Set(["Settled", "Cancelled", "Refunded"]);

// In-memory throttle so a single bet is read from chain at most once per window
// no matter how many list/feed requests arrive — keeps RPC usage bounded while
// still letting status (e.g. Open -> Matched) propagate to the UI quickly.
const lastSync = new Map<number, number>();
const SYNC_THROTTLE_MS = 2_000;

export function chainStatusFromOnchain(onchain: OnchainBetV2): string {
  if (
    onchain.status === "Open" &&
    onchain.acceptor &&
    onchain.acceptor !== ZERO
  ) {
    return "Matched";
  }
  return onchain.status;
}

/** Map on-chain winning outcome to the payout recipient (null = refund / push). */
export function winnerFromOnchain(onchain: OnchainBetV2): string | null {
  const win = onchain.winningOutcome;
  if (win === onchain.proposerOutcome) return getAddress(onchain.proposer);
  if (win === onchain.acceptorOutcome && onchain.acceptor !== ZERO) {
    return getAddress(onchain.acceptor);
  }
  return null;
}

export function winnerFromOutcome(bet: Bet, winningOutcome: number): string | null {
  if (winningOutcome === bet.proposerOutcome) return getAddress(bet.proposer);
  if (
    winningOutcome === bet.acceptorOutcome &&
    bet.acceptor &&
    bet.acceptor !== ZERO
  ) {
    return getAddress(bet.acceptor);
  }
  return null;
}

export function buildBetSyncUpdates(
  bet: Bet,
  onchain: OnchainBetV2,
): Record<string, unknown> {
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
  if (onchain.status === "Settled" || onchain.status === "Refunded") {
    if (onchain.status === "Settled") {
      const win = onchain.winningOutcome;
      if (bet.winningOutcome !== win) updates.winningOutcome = win;
      const winnerAddr = winnerFromOnchain(onchain);
      if ((bet.winner || null) !== winnerAddr) updates.winner = winnerAddr;
    } else {
      updates.status = "Refunded";
    }
  }
  return updates;
}

async function notifyBetSettlement(bet: Bet): Promise<void> {
  const outcomes = Array.isArray(bet.outcomes)
    ? (bet.outcomes as unknown as string[])
    : [];
  const winLabel =
    bet.winningOutcome != null ? outcomes[bet.winningOutcome] : undefined;
  const link = `/bets/${bet.id}`;
  const winner = bet.winner;
  const sides = [bet.proposer, bet.acceptor].filter((a): a is string => !!a);
  if (winner) {
    await notify({
      recipient: winner,
      type: "bet_settled",
      title: "You won a bet! 🎉",
      body: `"${bet.title}" resolved ${winLabel ? `to ${winLabel}` : ""}. You won the pool.`,
      link,
    });
    await notifyMany(
      sides.filter((a) => a.toLowerCase() !== winner.toLowerCase()),
      {
        type: "bet_settled",
        title: "A bet you were in settled",
        body: `"${bet.title}" resolved ${winLabel ? `to ${winLabel}` : ""}.`,
        link,
      },
    );
  } else {
    await notifyMany(sides, {
      type: "bet_settled",
      title: "A bet you were in settled",
      body: `"${bet.title}" resolved${winLabel ? ` to ${winLabel}` : ""} — stakes refunded.`,
      link,
    });
  }
}

/** Apply on-chain fields to the DB row; optionally notify on first settlement. */
export async function applyBetOnchainSync(
  bet: Bet,
  onchain: OnchainBetV2,
  opts: { notify?: boolean } = {},
): Promise<Bet> {
  const updates = buildBetSyncUpdates(bet, onchain);
  const becameSettled =
    (updates.status === "Settled" || updates.status === "Refunded") &&
    bet.status !== "Settled" &&
    bet.status !== "Refunded";

  if (Object.keys(updates).length > 0) {
    try {
      await prisma.bet.update({ where: { id: bet.id }, data: updates });
      Object.assign(bet, updates);
    } catch (err) {
      console.warn("bet sync update failed", err);
    }
  }

  if (onchain.status === "Settled") {
    await reconcileSettledBetProposals(bet.id, onchain.winningOutcome).catch(
      () => {},
    );
  }

  if (opts.notify && becameSettled) {
    await notifyBetSettlement(bet).catch(() => {});
  }

  return bet;
}

/**
 * Persist settlement from a known winning outcome (e.g. right after settleBet tx)
 * when RPC reads may still lag behind the receipt.
 */
export async function persistKnownSettlement(
  bet: Bet,
  winningOutcome: number,
  opts: { notify?: boolean } = {},
): Promise<Bet> {
  const winnerAddr = winnerFromOutcome(bet, winningOutcome);
  const becameSettled = bet.status !== "Settled" && bet.status !== "Refunded";
  const updates = {
    status: "Settled" as const,
    winningOutcome,
    winner: winnerAddr,
  };

  try {
    await prisma.bet.update({ where: { id: bet.id }, data: updates });
    Object.assign(bet, updates);
  } catch (err) {
    console.warn("known settlement persist failed", err);
    return bet;
  }

  await reconcileSettledBetProposals(bet.id, winningOutcome).catch(() => {});

  if (opts.notify && becameSettled) {
    await notifyBetSettlement(bet).catch(() => {});
  }

  return bet;
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

/** Re-read chain state after settleBet with short backoff for RPC lag. */
export async function readBetV2Settled(
  bet: Pick<Bet, "chainId" | "escrowAddress" | "onchainId">,
  attempts = 5,
): Promise<OnchainBetV2 | null> {
  for (let i = 0; i < attempts; i++) {
    const onchain = await readBetV2(
      bet.chainId,
      getAddress(bet.escrowAddress) as `0x${string}`,
      BigInt(bet.onchainId),
    ).catch(() => null);
    if (onchain?.status === "Settled" || onchain?.status === "Refunded") {
      return onchain;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

/**
 * Opportunistically sync a single bet's mutable on-chain state (status,
 * acceptor, winner) into the DB. Lightweight (no notifications) and safe to call
 * from list endpoints. Returns the (possibly mutated) bet row.
 */
export async function syncBetOnchain(
  bet: Bet,
  opts: { force?: boolean; notify?: boolean } = {},
): Promise<Bet> {
  // Old onchainId is intentionally cancelled during negotiated escrow refresh;
  // syncing it would mark the indexed bet Cancelled before the new offer lands.
  if (bet.escrowRevisionNeeded) {
    return healEscrowRevisionStatus(bet);
  }
  if (TERMINAL.has(bet.status) && bet.winner != null) return bet;

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

  return applyBetOnchainSync(bet, onchain, { notify: opts.notify });
}

/** Sync matched (and incomplete settled) bets for a wallet before stats/history. */
export async function syncUserParticipantBets(address: string): Promise<void> {
  const bets = await prisma.bet.findMany({
    where: {
      AND: [
        {
          OR: [
            { proposer: { equals: address, mode: "insensitive" } },
            { acceptor: { equals: address, mode: "insensitive" } },
          ],
        },
        {
          OR: [{ status: "Matched" }, { status: "Settled", winner: null }],
        },
      ],
    },
  });
  await Promise.all(bets.map((b) => syncBetOnchain(b, { force: true })));
}

/** Sync many bets in parallel; matched bets are prioritized within the RPC cap. */
export async function syncBetsOnchain(bets: Bet[], cap = 60): Promise<Bet[]> {
  const matched: Bet[] = [];
  const others: Bet[] = [];
  for (const b of bets) {
    if (TERMINAL.has(b.status)) continue;
    if (b.status === "Matched") matched.push(b);
    else others.push(b);
  }

  const toSync = [...matched, ...others].slice(0, cap);
  const synced = new Map<number, Bet>();
  await Promise.all(
    toSync.map(async (b) => {
      synced.set(b.id, await syncBetOnchain(b));
    }),
  );

  return bets.map((b) => synced.get(b.id) ?? b);
}
