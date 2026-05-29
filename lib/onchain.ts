/**
 * Server-side viem client for syncing on-chain state into Prisma.
 * The contract is the source of truth for status/winner/acceptor; the DB
 * cache is opportunistically refreshed whenever we read or list bets.
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { polygon, polygonAmoy } from "viem/chains";

import { SIDEBET_ESCROW_ABI, BET_STATUS, type BetStatusName } from "@/lib/abi";

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC || "https://polygon-rpc.com";
const amoyRpc =
  process.env.NEXT_PUBLIC_AMOY_RPC || "https://rpc-amoy.polygon.technology";

const clients: Record<number, PublicClient> = {
  [polygon.id]: createPublicClient({ chain: polygon, transport: http(polygonRpc) }),
  [polygonAmoy.id]: createPublicClient({
    chain: polygonAmoy,
    transport: http(amoyRpc),
  }),
};

export function getPublicClient(chainId: number): PublicClient | null {
  return clients[chainId] ?? null;
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
  const client = getPublicClient(chainId);
  if (!client) return null;
  try {
    const raw = (await client.readContract({
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
