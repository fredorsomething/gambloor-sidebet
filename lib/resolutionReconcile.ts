import { prisma } from "@/lib/db";

/**
 * Close any non-terminal resolution proposal for a sidebet that has already
 * settled on-chain.
 *
 * On-chain settlement (settleBet) and the off-chain ResolutionProposal review
 * are independent. If a settler finalizes a bet before an admin verifies a
 * pending proposal, that proposal would otherwise sit "Pending" in the admin
 * queue forever (the limbo). This reconciles the two: a proposal that matches
 * the on-chain winning outcome is marked Approved, anything else Rejected, with
 * a clear system note. Idempotent — only touches Pending/Approved rows.
 *
 * @param betId           the Bet id
 * @param winningOutcome  the on-chain winning outcome index (from chain sync)
 */
export async function reconcileSettledBetProposals(
  betId: number,
  winningOutcome: number | null | undefined,
): Promise<void> {
  const open = await prisma.resolutionProposal.findMany({
    where: {
      subjectType: "bet",
      subjectId: betId,
      status: { in: ["Pending", "Approved"] },
    },
  });
  if (open.length === 0) return;

  await Promise.all(
    open.map((p) => {
      const matches =
        winningOutcome != null && p.proposedOutcome === winningOutcome;
      // A proposal already Approved that matches needs no change.
      if (matches && p.status === "Approved") return Promise.resolve();
      return prisma.resolutionProposal.update({
        where: { id: p.id },
        data: {
          status: matches ? "Approved" : "Rejected",
          reviewedBy: "system",
          reviewNote: matches
            ? "Auto-verified: matches the on-chain settled outcome."
            : "Auto-closed: the bet was settled on-chain with a different outcome.",
        },
      });
    }),
  );
}
