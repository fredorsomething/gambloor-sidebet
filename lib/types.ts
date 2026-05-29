import type { BetStatusName } from "@/lib/abi";
import type { BookSnapshot } from "@/lib/exchange/types";

export type BetRow = {
  id: number;
  chainId: number;
  escrowAddress: string;
  onchainId: string;
  txHash: string | null;
  proposer: string;
  acceptor: string | null;
  settler: string;
  token: string;
  tokenSymbol: string | null;
  decimals: number;

  // Stakes (decimal strings). `amount` == proposerStake (legacy mirror).
  amount: string;
  proposerStake: string;
  acceptorStake: string;

  // Outcomes
  outcomes: string[];
  proposerOutcome: number;
  acceptorOutcome: number;
  winningOutcome: number | null;

  title: string;
  description: string;
  imageUrl: string | null;
  terms: string;
  termsHash: string;
  nonce: string;
  status: BetStatusName;
  winner: string | null;
  feeBps: number;
  acceptDeadline: string | null;
  estimatedEndDate: string | null;
  lockedNegotiationId: number | null;
  intendedAcceptor: string | null;
  escrowRevisionNeeded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListBetsResponse = {
  items: BetRow[];
  total: number;
};

export type GetBetResponse = {
  bet: BetRow;
  onchain: {
    proposer: string;
    acceptor: string;
    settler: string;
    token: string;
    proposerStake: string;
    acceptorStake: string;
    proposerOutcome: number;
    acceptorOutcome: number;
    numOutcomes: number;
    createdAt: string;
    acceptDeadline: string;
    estimatedEndDate: string;
    feeBps: number;
    status: BetStatusName;
    statusCode: number;
    winningOutcome: number;
    termsHash: string;
  } | null;
};

// ---------------- CLOB markets ----------------

export type MarketOutcomeRow = {
  index: number;
  label: string;
  positionId: string;
};

/** Compact per-outcome pricing for listing cards (probabilities in 0–1). */
export type MarketQuote = {
  index: number;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
};

export type MarketRow = {
  id: number;
  chainId: number;
  exchangeAddress: string;
  ctfAddress: string;
  conditionId: string;
  questionId: string;
  txHash: string | null;
  creator: string;
  settler: string;
  feeBps: number;
  token: string;
  tokenSymbol: string | null;
  decimals: number;
  title: string;
  description: string;
  imageUrl: string | null;
  terms: string;
  termsHash: string;
  nonce: string;
  status: string;
  winningOutcome: number | null;
  estimatedEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  outcomes: MarketOutcomeRow[];
  quotes?: MarketQuote[];
};

/** Viewer's custodial state for a market (micro-unit decimal strings). */
export type ViewerState = {
  collateral: { balance: string; locked: string };
  shares: Record<number, { balance: string; locked: string }>;
};

export type MarketDetailResponse = {
  market: MarketRow;
  book: BookSnapshot;
  viewer?: ViewerState;
};

export type ListMarketsResponse = {
  items: MarketRow[];
  total: number;
};
