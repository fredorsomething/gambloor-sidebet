/**
 * Server-side viem client for syncing on-chain state into Prisma.
 * Polygon mainnet only (chain id 137).
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { polygon } from "viem/chains";

import { POLYGON_CHAIN_ID } from "@/lib/chains";
import {
  SIDEBET_ESCROW_ABI,
  SIDEBET_ESCROW_V2_ABI,
  BET_STATUS,
  type BetStatusName,
} from "@/lib/abi";

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  "https://polygon-bor-rpc.publicnode.com";

const client: PublicClient = createPublicClient({
  chain: polygon,
  transport: http(polygonRpc),
});

export function getPublicClient(chainId: number): PublicClient | null {
  if (chainId !== POLYGON_CHAIN_ID) return null;
  return client;
}

export type OnchainBet = {
  proposer: Address;
  acceptor: Address;
  settler: Address;
  token: Address;
  amount: bigint;
  createdAt: bigint;
  acceptDeadline: bigint;
  settleDeadline: bigint;
  feeBps: number;
  status: BetStatusName;
  statusCode: number;
  winner: Address;
  termsHash: `0x${string}`;
};

export async function readBet(
  chainId: number,
  escrow: Address,
  id: bigint,
): Promise<OnchainBet | null> {
  const publicClient = getPublicClient(chainId);
  if (!publicClient) return null;
  try {
    const raw = (await publicClient.readContract({
      address: escrow,
      abi: SIDEBET_ESCROW_ABI,
      functionName: "getBet",
      args: [id],
    })) as {
      proposer: Address;
      acceptor: Address;
      settler: Address;
      token: Address;
      amount: bigint;
      createdAt: bigint;
      acceptDeadline: bigint;
      settleDeadline: bigint;
      feeBps: number;
      status: number;
      winner: Address;
      termsHash: `0x${string}`;
    };

    const statusCode = Number(raw.status);
    const status = (BET_STATUS[statusCode as keyof typeof BET_STATUS] ??
      "None") as BetStatusName;

    return {
      proposer: raw.proposer,
      acceptor: raw.acceptor,
      settler: raw.settler,
      token: raw.token,
      amount: raw.amount,
      createdAt: raw.createdAt,
      acceptDeadline: raw.acceptDeadline,
      settleDeadline: raw.settleDeadline,
      feeBps: Number(raw.feeBps),
      status,
      statusCode,
      winner: raw.winner,
      termsHash: raw.termsHash,
    };
  } catch (err) {
    console.warn("readBet failed", { chainId, escrow, id: id.toString(), err });
    return null;
  }
}

export type OnchainBetV2 = {
  proposer: Address;
  acceptor: Address;
  settler: Address;
  token: Address;
  proposerStake: bigint;
  acceptorStake: bigint;
  proposerOutcome: number;
  acceptorOutcome: number;
  numOutcomes: number;
  createdAt: bigint;
  acceptDeadline: bigint;
  estimatedEndDate: bigint;
  feeBps: number;
  status: BetStatusName;
  statusCode: number;
  winningOutcome: number;
  termsHash: `0x${string}`;
};

export async function readBetV2(
  chainId: number,
  escrow: Address,
  id: bigint,
): Promise<OnchainBetV2 | null> {
  const publicClient = getPublicClient(chainId);
  if (!publicClient) return null;
  try {
    const raw = (await publicClient.readContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "getBet",
      args: [id],
    })) as {
      proposer: Address;
      acceptor: Address;
      settler: Address;
      token: Address;
      proposerStake: bigint;
      acceptorStake: bigint;
      proposerOutcome: number;
      acceptorOutcome: number;
      numOutcomes: number;
      createdAt: bigint;
      acceptDeadline: bigint;
      estimatedEndDate: bigint;
      feeBps: number;
      status: number;
      winningOutcome: number;
      termsHash: `0x${string}`;
    };

    const statusCode = Number(raw.status);
    const status = (BET_STATUS[statusCode as keyof typeof BET_STATUS] ??
      "None") as BetStatusName;

    return {
      proposer: raw.proposer,
      acceptor: raw.acceptor,
      settler: raw.settler,
      token: raw.token,
      proposerStake: raw.proposerStake,
      acceptorStake: raw.acceptorStake,
      proposerOutcome: Number(raw.proposerOutcome),
      acceptorOutcome: Number(raw.acceptorOutcome),
      numOutcomes: Number(raw.numOutcomes),
      createdAt: raw.createdAt,
      acceptDeadline: raw.acceptDeadline,
      estimatedEndDate: raw.estimatedEndDate,
      feeBps: Number(raw.feeBps),
      status,
      statusCode,
      winningOutcome: Number(raw.winningOutcome),
      termsHash: raw.termsHash,
    };
  } catch (err) {
    console.warn("readBetV2 failed", { chainId, escrow, id: id.toString(), err });
    return null;
  }
}
