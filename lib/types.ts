import type { BetStatusName } from "@/lib/abi";

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
  amount: string;
  title: string;
  description: string;
  terms: string;
  termsHash: string;
  nonce: string;
  status: BetStatusName;
  winner: string | null;
  feeBps: number;
  acceptDeadline: string | null;
  settleDeadline: string | null;
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
    amount: string;
    createdAt: string;
    acceptDeadline: string;
    settleDeadline: string;
    feeBps: number;
    status: BetStatusName;
    statusCode: number;
    winner: string;
    termsHash: string;
  } | null;
};
