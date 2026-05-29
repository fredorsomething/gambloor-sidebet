import { formatUnits } from "viem";

import type { BetRow } from "@/lib/types";

export type NegotiationStatus = "Pending" | "Accepted" | "Declined" | "Withdrawn";

export type NegotiationPayload = {
  id: number;
  betId: number;
  fromAddress: string;
  toAddress: string;
  proposerStake: string;
  acceptorStake: string;
  terms: string | null;
  message: string | null;
  status: NegotiationStatus;
  createdAt: string;
};

export type NegotiationBetContext = {
  id: number;
  title: string;
  status: string;
  proposer: string;
  tokenSymbol: string | null;
  decimals: number;
  outcomes: string[];
  proposerOutcome: number;
  acceptorOutcome: number;
  terms: string;
  description: string;
  token: string;
  settler: string;
  feeBps: number;
  estimatedEndDate: string | null;
};

/** Short preview for conversation list when the last message is an offer card. */
export function negotiationPreview(status: NegotiationStatus): string {
  switch (status) {
    case "Pending":
      return "Counter-offer";
    case "Accepted":
      return "Terms accepted";
    case "Declined":
      return "Offer declined";
    case "Withdrawn":
      return "Offer withdrawn";
    default:
      return "Counter-offer";
  }
}

export function betToNegotiationContext(bet: {
  id: number;
  title: string;
  status: string;
  proposer: string;
  tokenSymbol: string | null;
  decimals: number;
  outcomes: unknown;
  proposerOutcome: number;
  acceptorOutcome: number;
  terms: string;
  description: string;
  token: string;
  settler: string;
  feeBps: number;
  estimatedEndDate: Date | string | null;
}): NegotiationBetContext {
  const outcomes = Array.isArray(bet.outcomes)
    ? (bet.outcomes as string[])
    : [];
  const end =
    bet.estimatedEndDate instanceof Date
      ? bet.estimatedEndDate.toISOString()
      : bet.estimatedEndDate;
  return {
    id: bet.id,
    title: bet.title,
    status: bet.status,
    proposer: bet.proposer,
    tokenSymbol: bet.tokenSymbol,
    decimals: bet.decimals,
    outcomes,
    proposerOutcome: bet.proposerOutcome,
    acceptorOutcome: bet.acceptorOutcome,
    terms: bet.terms,
    description: bet.description,
    token: bet.token,
    settler: bet.settler,
    feeBps: bet.feeBps,
    estimatedEndDate: end,
  };
}

/** Build relaunch payload after an offer is accepted (proposer flow). */
export function relaunchPayloadFromNegotiation(
  bet: NegotiationBetContext,
  n: NegotiationPayload,
  decimals: number,
): Record<string, unknown> {
  const full = (wei: string) => {
    try {
      return formatUnits(BigInt(wei), decimals);
    } catch {
      return "0";
    }
  };
  const endDate = bet.estimatedEndDate
    ? new Date(bet.estimatedEndDate).toISOString().slice(0, 10)
    : "";
  return {
    title: bet.title,
    description: bet.description,
    terms: n.terms?.trim() || bet.terms,
    token: bet.token,
    settler: bet.settler,
    feeBps: bet.feeBps,
    endDate,
    outcomes: bet.outcomes,
    proposerOutcome: bet.proposerOutcome,
    acceptorOutcome: bet.acceptorOutcome,
    yourStakeStr: full(n.proposerStake),
    theirStakeStr: full(n.acceptorStake),
  };
}

export type BetRowLike = Pick<
  BetRow,
  | "id"
  | "title"
  | "status"
  | "proposer"
  | "tokenSymbol"
  | "decimals"
  | "outcomes"
  | "proposerOutcome"
  | "acceptorOutcome"
  | "terms"
  | "description"
  | "token"
  | "settler"
  | "feeBps"
  | "estimatedEndDate"
>;
