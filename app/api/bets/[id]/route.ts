import { NextRequest } from "next/server";
import { getAddress } from "viem";

import { loadBetResolutionState } from "@/lib/betResolution";
import { prisma } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notifications";
import { reconcileSettledBetProposals } from "@/lib/resolutionReconcile";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { readBetV2 } from "@/lib/onchain";

export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("not found", 404);

  if (bet.escrowRevisionNeeded && bet.status === "Cancelled") {
    try {
      await prisma.bet.update({ where: { id }, data: { status: "Open" } });
      bet.status = "Open";
    } catch (err) {
      console.warn("escrow revision status heal failed", err);
    }
  }

  // Opportunistic sync from chain (SidebetEscrowV2).
  const onchain = await readBetV2(
    bet.chainId,
    getAddress(bet.escrowAddress) as `0x${string}`,
    BigInt(bet.onchainId),
  );

  if (onchain && !bet.escrowRevisionNeeded) {
    const updates: Record<string, unknown> = {};
    if (onchain.status !== bet.status) updates.status = onchain.status;
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
      // Map the winning outcome to the winning address (or null on a refund).
      const winnerAddr =
        win === onchain.proposerOutcome
          ? getAddress(onchain.proposer)
          : win === onchain.acceptorOutcome && onchain.acceptor !== ZERO
            ? getAddress(onchain.acceptor)
            : null;
      if ((bet.winner || null) !== winnerAddr) updates.winner = winnerAddr;
    }
    if (Object.keys(updates).length > 0) {
      const becameSettled =
        updates.status === "Settled" && bet.status !== "Settled";
      try {
        await prisma.bet.update({ where: { id }, data: updates });
        Object.assign(bet, updates);
      } catch (err) {
        console.warn("sync update failed", err);
      }

      // First time we observe settlement: notify both sides win/lose.
      if (becameSettled) {
        const outcomes = Array.isArray(bet.outcomes)
          ? (bet.outcomes as unknown as string[])
          : [];
        const winLabel =
          bet.winningOutcome != null ? outcomes[bet.winningOutcome] : undefined;
        const link = `/bets/${bet.id}`;
        const winner = bet.winner;
        const sides = [bet.proposer, bet.acceptor].filter(
          (a): a is string => !!a,
        );
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
    }

    // The bet is settled on-chain (now or earlier): make sure no resolution
    // proposal is left dangling in the admin review queue (the limbo bug).
    if (onchain.status === "Settled") {
      await reconcileSettledBetProposals(id, onchain.winningOutcome).catch(
        (err) => console.warn("resolution reconcile failed", err),
      );
    }
  }

  const resolution =
    bet.status === "Matched" || bet.status === "Settled"
      ? await loadBetResolutionState(bet)
      : null;

  return jsonOk({
    bet,
    onchain,
    resolution: resolution
      ? {
          proposer: resolution.proposer,
          acceptor: resolution.acceptor,
          consensus: resolution.consensus,
          agreedOutcome: resolution.agreedOutcome,
          verifiedOutcome: resolution.verifiedOutcome,
        }
      : undefined,
  });
}
