/**
 * Server-side client for the matching engine's internal JSON-RPC. Used only by
 * Next.js API routes (never the browser); authenticated by a shared secret.
 *
 * The engine is the single writer for the order book + ledger. Next forwards
 * authenticated user actions here and reads the durable ledger from Postgres
 * directly for balances/positions.
 */
import type { BookSnapshot } from "@/lib/exchange/types";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8090";
const ENGINE_RPC_SECRET = process.env.ENGINE_RPC_SECRET || "";

export class EngineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-engine-secret": ENGINE_RPC_SECRET,
      },
      body: JSON.stringify({ method, params }),
      cache: "no-store",
    });
  } catch {
    throw new EngineError("matching engine unavailable", 503);
  }
  let json: { ok?: boolean; result?: T; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new EngineError("bad engine response", 502);
  }
  if (!res.ok || json.error) {
    throw new EngineError(json.error || "engine error", res.status >= 400 ? res.status : 400);
  }
  return json.result as T;
}

export type EnginePlaceResult = {
  filledQty: string;
  restId: string | null;
  fills: { matchType: string; qty: string; price: string; outcomeIndex: number; side: "BUY" | "SELL" }[];
};

export function enginePlaceOrder(params: {
  marketId: number;
  maker: string;
  side: "BUY" | "SELL";
  outcomeIndex: number;
  type: "LIMIT" | "MARKET";
  price: string; // micro
  qty: string; // micro
}): Promise<EnginePlaceResult> {
  return rpc<EnginePlaceResult>("placeOrder", params);
}

export function engineCancelOrder(params: {
  marketId: number;
  orderId: string;
  owner: string;
}): Promise<{ ok: true }> {
  return rpc("cancelOrder", params);
}

export function engineSnapshot(marketId: number): Promise<BookSnapshot> {
  return rpc<BookSnapshot>("snapshot", { marketId });
}

export type EngineOpenOrder = {
  id: string;
  side: "BUY" | "SELL";
  outcomeIndex: number;
  price: string;
  qty: string;
  remaining: string;
  createdAt: number;
};

export function engineOpenOrders(marketId: number, owner: string): Promise<EngineOpenOrder[]> {
  return rpc<EngineOpenOrder[]>("openOrders", { marketId, owner });
}

export function engineSettleMarket(marketId: number, winningOutcome: number): Promise<{ ok: true }> {
  return rpc("settleMarket", { marketId, winningOutcome });
}

/**
 * Mint complete sets: turn `qty` micro-collateral into one micro-share of every
 * outcome (reserve-backed). The optional `deposit` credits a confirmed on-chain
 * transfer first so multi-outcome markets fund just-in-time like a buy.
 */
export function engineSplitSet(params: {
  marketId: number;
  owner: string;
  qty: string; // micro
  deposit?: { amount: string; txHash: string; logIndex: number; chainId: number };
}): Promise<{ ok: true; minted: string }> {
  return rpc("splitSet", params);
}

/** Redeem complete sets: burn one free micro-share of every outcome for `qty` collateral. */
export function engineMergeSet(params: {
  marketId: number;
  owner: string;
  qty: string; // micro
}): Promise<{ ok: true; redeemed: string }> {
  return rpc("mergeSet", params);
}

export function engineReloadMarket(marketId: number): Promise<{ ok: true }> {
  return rpc("reloadMarket", { marketId });
}

export function engineRequestWithdrawal(params: {
  address: string;
  amount: string;
  fee: string;
  status: string;
}): Promise<{ id: number }> {
  return rpc<{ id: number }>("requestWithdrawal", params);
}

/**
 * Credit a confirmed on-chain USDC.e transfer into a user's collateral so an
 * order can be funded at placement time. Idempotent per (txHash, logIndex);
 * returns { credited: false } if it was already credited (e.g. by the bridge).
 */
export function engineCreditDeposit(params: {
  address: string;
  amount: string;
  txHash: string;
  logIndex: number;
  chainId: number;
}): Promise<{ credited: boolean }> {
  return rpc<{ credited: boolean }>("creditDeposit", params);
}
