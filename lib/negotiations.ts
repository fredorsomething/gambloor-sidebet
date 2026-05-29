import { randomUUID } from "crypto";

import type { Hex } from "viem";

import type { BetRow } from "@/lib/types";
import { buildTermsHash } from "@/lib/utils";

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
  proposerStake: string;
  acceptorStake: string;
  lockedNegotiationId: number | null;
  intendedAcceptor: string | null;
  escrowRevisionNeeded: boolean;
};

/** Wallet that should take the other side after terms are locked in. */
export function negotiationIntendedAcceptor(
  fromAddress: string,
  toAddress: string,
  proposer: string,
): string {
  const p = proposer.toLowerCase();
  return fromAddress.toLowerCase() === p
    ? toAddress.toLowerCase()
    : fromAddress.toLowerCase();
}

/** Apply accepted counter-offer terms onto the existing bet row (off-chain lock-in). */
export function betUpdateFromAcceptedNegotiation(
  bet: {
    title: string;
    description: string;
    terms: string;
    nonce: string;
    proposer: string;
    outcomes: unknown;
  },
  negotiation: {
    id: number;
    fromAddress: string;
    toAddress: string;
    proposerStake: string;
    acceptorStake: string;
    terms: string | null;
  },
): {
  proposerStake: string;
  acceptorStake: string;
  amount: string;
  terms: string;
  nonce: string;
  termsHash: Hex;
  intendedAcceptor: string;
  lockedNegotiationId: number;
  escrowRevisionNeeded: boolean;
  acceptor: null;
  status: "Open";
} {
  const outcomes = Array.isArray(bet.outcomes)
    ? (bet.outcomes as string[]).map((o) => o.trim())
    : [];
  const terms = (negotiation.terms?.trim() || bet.terms).trim();
  const termsChanged = terms !== bet.terms.trim();
  const nonce = termsChanged ? randomUUID() : bet.nonce;
  const termsHash = buildTermsHash({
    title: bet.title,
    description: bet.description,
    terms,
    proposer: bet.proposer,
    nonce,
    outcomes,
  });
  const toAddr = negotiation.toAddress;
  return {
    proposerStake: negotiation.proposerStake,
    acceptorStake: negotiation.acceptorStake,
    amount: negotiation.proposerStake,
    terms,
    nonce,
    termsHash,
    intendedAcceptor: negotiationIntendedAcceptor(
      negotiation.fromAddress,
      toAddr,
      bet.proposer,
    ),
    lockedNegotiationId: negotiation.id,
    escrowRevisionNeeded: true,
    acceptor: null,
    status: "Open",
  };
}

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
  proposerStake?: string;
  acceptorStake?: string;
  amount?: string;
  lockedNegotiationId?: number | null;
  intendedAcceptor?: string | null;
  escrowRevisionNeeded?: boolean;
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
    proposerStake: bet.proposerStake ?? bet.amount ?? "0",
    acceptorStake: bet.acceptorStake ?? bet.amount ?? "0",
    lockedNegotiationId: bet.lockedNegotiationId ?? null,
    intendedAcceptor: bet.intendedAcceptor ?? null,
    escrowRevisionNeeded: bet.escrowRevisionNeeded ?? false,
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
