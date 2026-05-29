import { prisma } from "@/lib/db";
import {
  betToNegotiationContext,
  type NegotiationBetContext,
  type NegotiationPayload,
} from "@/lib/negotiations";

export type DmNegotiationBundle = {
  negotiation: NegotiationPayload;
  bet: NegotiationBetContext;
};

function rowToPayload(n: {
  id: number;
  betId: number;
  fromAddress: string;
  toAddress: string | null;
  proposerStake: string;
  acceptorStake: string;
  terms: string | null;
  message: string | null;
  status: string;
  createdAt: Date;
  bet: Parameters<typeof betToNegotiationContext>[0];
}): DmNegotiationBundle {
  const proposer = n.bet.proposer.toLowerCase();
  return {
    negotiation: {
      id: n.id,
      betId: n.betId,
      fromAddress: n.fromAddress,
      toAddress: n.toAddress ?? proposer,
      proposerStake: n.proposerStake,
      acceptorStake: n.acceptorStake,
      terms: n.terms,
      message: n.message,
      status: n.status as NegotiationPayload["status"],
      createdAt: n.createdAt.toISOString(),
    },
    bet: betToNegotiationContext(n.bet),
  };
}

/** Load negotiation cards for a set of DM message ids. */
export async function loadNegotiationBundles(
  negotiationIds: number[],
): Promise<Record<number, DmNegotiationBundle>> {
  const ids = [...new Set(negotiationIds.filter((id) => id > 0))];
  if (ids.length === 0) return {};

  const rows = await prisma.betNegotiation.findMany({
    where: { id: { in: ids } },
    include: {
      bet: {
        select: {
          id: true,
          title: true,
          status: true,
          proposer: true,
          tokenSymbol: true,
          decimals: true,
          outcomes: true,
          proposerOutcome: true,
          acceptorOutcome: true,
          terms: true,
          description: true,
          token: true,
          settler: true,
          feeBps: true,
          estimatedEndDate: true,
          proposerStake: true,
          acceptorStake: true,
          amount: true,
          lockedNegotiationId: true,
          intendedAcceptor: true,
          escrowRevisionNeeded: true,
        },
      },
    },
  });

  const out: Record<number, DmNegotiationBundle> = {};
  for (const n of rows) {
    out[n.id] = rowToPayload(n);
  }
  return out;
}

/** Open bets where these two wallets have negotiated (for compose UI in DMs). */
export async function openBetsForDmPair(me: string, other: string) {
  const negotiations = await prisma.betNegotiation.findMany({
    where: {
      OR: [
        { fromAddress: me, toAddress: other },
        { fromAddress: other, toAddress: me },
        { fromAddress: me, bet: { proposer: other } },
        { fromAddress: other, bet: { proposer: me } },
      ],
      bet: { status: "Open" },
    },
    include: {
      bet: {
        select: {
          id: true,
          title: true,
          status: true,
          proposer: true,
          tokenSymbol: true,
          decimals: true,
          outcomes: true,
          proposerOutcome: true,
          acceptorOutcome: true,
          terms: true,
          description: true,
          token: true,
          settler: true,
          feeBps: true,
          estimatedEndDate: true,
          proposerStake: true,
          acceptorStake: true,
          amount: true,
          lockedNegotiationId: true,
          intendedAcceptor: true,
          escrowRevisionNeeded: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const seen = new Set<number>();
  const bets: Array<{
    bet: NegotiationBetContext;
    proposerStake: string;
    acceptorStake: string;
  }> = [];

  for (const n of negotiations) {
    if (seen.has(n.betId)) continue;
    seen.add(n.betId);
    bets.push({
      bet: betToNegotiationContext(n.bet),
      proposerStake: n.bet.proposerStake || n.bet.amount || "0",
      acceptorStake: n.bet.acceptorStake || n.bet.amount || "0",
    });
  }

  // Also include open bets where one party is proposer and they messaged
  const directBets = await prisma.bet.findMany({
    where: {
      status: "Open",
      OR: [
        { proposer: me, /* taker could message proposer */ },
        { proposer: other },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      proposer: true,
      tokenSymbol: true,
      decimals: true,
      outcomes: true,
      proposerOutcome: true,
      acceptorOutcome: true,
      terms: true,
      description: true,
      token: true,
      settler: true,
      feeBps: true,
      estimatedEndDate: true,
      proposerStake: true,
      acceptorStake: true,
      amount: true,
      lockedNegotiationId: true,
      intendedAcceptor: true,
      escrowRevisionNeeded: true,
    },
    take: 10,
  });

  for (const b of directBets) {
    const p = b.proposer.toLowerCase();
    if (p !== me && p !== other) continue;
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    bets.push({
      bet: betToNegotiationContext(b),
      proposerStake: b.proposerStake || b.amount || "0",
      acceptorStake: b.acceptorStake || b.amount || "0",
    });
  }

  return bets;
}
