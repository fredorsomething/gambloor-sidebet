import { prisma } from "@/lib/db";

export type BetDeclaration = {
  id: number;
  proposedOutcome: number;
  status: string;
  note: string | null;
  proposedBy: string;
  createdAt?: Date;
};

export type BetResolutionConsensus =
  | "none" // neither party has declared
  | "partial" // one party declared
  | "unanimous" // both agree — auto-approved, ready for on-chain settle
  | "disputed"; // both declared different outcomes — admin must review

export type BetResolutionState = {
  proposer: BetDeclaration | null;
  acceptor: BetDeclaration | null;
  consensus: BetResolutionConsensus;
  /** When consensus is unanimous, the outcome both parties declared. */
  agreedOutcome: number | null;
  /** Admin-verified outcome (any Approved proposal on this bet). */
  verifiedOutcome: number | null;
};

type BetParties = {
  id: number;
  proposer: string;
  acceptor: string | null;
  status: string;
};

function latestPerParty(
  rows: Array<{
    id: number;
    proposedBy: string;
    proposedOutcome: number;
    status: string;
    note: string | null;
    createdAt: Date;
  }>,
  party: string,
): BetDeclaration | null {
  const addr = party.toLowerCase();
  const hit = rows.find((r) => r.proposedBy.toLowerCase() === addr);
  if (!hit) return null;
  return {
    id: hit.id,
    proposedOutcome: hit.proposedOutcome,
    status: hit.status as BetDeclaration["status"],
    note: hit.note,
    proposedBy: hit.proposedBy,
    createdAt: hit.createdAt,
  };
}

export function computeBetConsensus(
  proposer: BetDeclaration | null,
  acceptor: BetDeclaration | null,
): Pick<BetResolutionState, "consensus" | "agreedOutcome"> {
  if (!proposer && !acceptor) {
    return { consensus: "none", agreedOutcome: null };
  }
  if (!proposer || !acceptor) {
    return { consensus: "partial", agreedOutcome: null };
  }
  if (proposer.proposedOutcome === acceptor.proposedOutcome) {
    return { consensus: "unanimous", agreedOutcome: proposer.proposedOutcome };
  }
  return { consensus: "disputed", agreedOutcome: null };
}

/** Latest declaration per proposer/acceptor plus consensus summary. */
export async function loadBetResolutionState(
  bet: BetParties,
): Promise<BetResolutionState> {
  const rows = await prisma.resolutionProposal.findMany({
    where: { subjectType: "bet", subjectId: bet.id },
    orderBy: { createdAt: "desc" },
  });

  const proposerDecl = latestPerParty(rows, bet.proposer);
  const acceptorDecl = bet.acceptor
    ? latestPerParty(rows, bet.acceptor)
    : null;

  const { consensus, agreedOutcome } = computeBetConsensus(
    proposerDecl,
    acceptorDecl,
  );

  const approved = rows.find((r) => r.status === "Approved");

  return {
    proposer: proposerDecl,
    acceptor: acceptorDecl,
    consensus,
    agreedOutcome,
    verifiedOutcome: approved?.proposedOutcome ?? null,
  };
}

/** After both parties declare the same outcome, auto-approve their proposals. */
export async function autoApproveUnanimousBet(
  betId: number,
  outcome: number,
): Promise<void> {
  const open = await prisma.resolutionProposal.findMany({
    where: {
      subjectType: "bet",
      subjectId: betId,
      status: { in: ["Pending", "Rejected"] },
    },
  });
  await Promise.all(
    open.map((p) =>
      prisma.resolutionProposal.update({
        where: { id: p.id },
        data: {
          status: "Approved",
          reviewedBy: "system",
          reviewNote: "Auto-approved: both parties declared the same outcome.",
          proposedOutcome: outcome,
        },
      }),
    ),
  );
}

/** Whether the settler may call settleBet for this matched bet. */
export function settlerMaySettle(state: BetResolutionState): {
  allowed: boolean;
  requiredOutcome?: number;
  reason?: string;
} {
  if (state.consensus === "unanimous" && state.agreedOutcome != null) {
    return { allowed: true, requiredOutcome: state.agreedOutcome };
  }
  if (state.verifiedOutcome != null) {
    return { allowed: true, requiredOutcome: state.verifiedOutcome };
  }
  if (state.consensus === "disputed") {
    return {
      allowed: false,
      reason:
        "Proposer and acceptor declared different outcomes. An admin must verify the result before settlement.",
    };
  }
  // No declarations, or only one party — settler retains discretion.
  return { allowed: true };
}

export function betPartyRole(
  bet: BetParties,
  address: string,
): "proposer" | "acceptor" | null {
  const a = address.toLowerCase();
  if (bet.proposer.toLowerCase() === a) return "proposer";
  if (bet.acceptor?.toLowerCase() === a) return "acceptor";
  return null;
}
