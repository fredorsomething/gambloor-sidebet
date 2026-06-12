import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { getPublicClient } from "@/lib/onchain";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  enginePlaceOrder,
  engineRefundOrphanFunding,
  EngineError,
} from "@/lib/engineClient";
import { verifyFundingTransfer } from "@/lib/fundingVerification";
import {
  MAX_PRICE,
  MIN_PRICE,
  costOf,
  feeOf,
  parseAmount,
  parsePrice,
} from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

const HEX_TX = /^0x[0-9a-fA-F]{64}$/;

const OrderSchema = z.object({
  maker: z.string(),
  side: z.enum(["BUY", "SELL"]),
  outcomeIndex: z.number().int().min(0).max(15),
  type: z.enum(["LIMIT", "MARKET"]).default("LIMIT"),
  // Probability in (0,1) for LIMIT orders.
  price: z.number().gt(0).lt(1).optional(),
  // Share quantity in whole shares (e.g. 12.5).
  shares: z.number().gt(0),
  // For BUY orders: the on-chain USDC.e transfer that funds this order. Funds
  // move to the treasury only when the order is posted (no upfront deposit).
  fundingTxHash: z.string().regex(HEX_TX, "bad funding tx").optional(),
});

/**
 * POST /api/markets/[id]/orders — place a custodial order.
 *
 * The order is authenticated (Privy) and forwarded to the matching engine,
 * which matches it against the live book and settles the internal ledger
 * atomically. No EIP-712 signing, no on-chain transaction.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = OrderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  if (d.type === "LIMIT" && d.price == null) {
    return jsonErr("price is required for limit orders", 400);
  }

  const market = await prisma.market.findUnique({
    where: { id },
    select: marketWithOutcomesSelect,
  });
  if (!market) return jsonErr("market not found", 404);
  if (market.status !== "Open") return jsonErr("market is not open for trading", 400);
  if (!market.outcomes.some((o) => o.index === d.outcomeIndex)) {
    return jsonErr("bad outcome index", 400);
  }

  const maker = getAddress(d.maker);
  const auth = await verifyWalletAuth({ req, address: maker });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const priceMicro =
    d.type === "MARKET"
      ? (d.side === "BUY" ? MAX_PRICE : MIN_PRICE)
      : parsePrice(d.price!);
  const qtyMicro = parseAmount(d.shares);
  if (qtyMicro <= 0n) return jsonErr("shares must be positive", 400);

  let fundingDeposit:
    | { amount: string; txHash: string; logIndex: number; chainId: number }
    | undefined;

  // Just-in-time funding: verify the on-chain transfer, then credit + place in
  // one engine call so a failed order never strands USDC.e in the treasury.
  if (d.side === "BUY") {
    if (!d.fundingTxHash) {
      return jsonErr("buy orders must include a funding transfer", 400);
    }
    const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
    if (!treasuryRaw) return jsonErr("treasury not configured", 503);

    const publicClient = getPublicClient(market.chainId);
    if (!publicClient) return jsonErr("unsupported chain", 400);

    const required =
      costOf(priceMicro, qtyMicro) +
      feeOf(costOf(priceMicro, qtyMicro), market.feeBps);

    const verified = await verifyFundingTransfer({
      publicClient,
      txHash: d.fundingTxHash as `0x${string}`,
      token: market.token,
      maker,
      treasury: treasuryRaw,
    });
    if ("error" in verified) return jsonErr(verified.error, 400);
    if (verified.transferred < required) {
      return jsonErr("funding transfer is insufficient for this order", 400);
    }

    fundingDeposit = {
      amount: verified.transferred.toString(),
      txHash: d.fundingTxHash,
      logIndex: verified.logIndex,
      chainId: market.chainId,
    };
  }

  try {
    const result = await enginePlaceOrder({
      marketId: id,
      maker: maker.toLowerCase(),
      side: d.side,
      outcomeIndex: d.outcomeIndex,
      type: d.type,
      price: priceMicro.toString(),
      qty: qtyMicro.toString(),
      deposit: fundingDeposit,
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    // Last-resort safety net: if the engine credited the transfer but the order
    // still failed (or the RPC died mid-flight), return the USDC.e to the user.
    if (fundingDeposit) {
      try {
        await engineRefundOrphanFunding({
          address: maker.toLowerCase(),
          amount: fundingDeposit.amount,
          txHash: fundingDeposit.txHash,
          logIndex: fundingDeposit.logIndex,
          chainId: fundingDeposit.chainId,
        });
      } catch (refundErr) {
        console.error("orphan funding refund failed", refundErr);
      }
    }
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("place order failed", err);
    return jsonErr("failed to place order — your USDC.e is being returned", 500);
  }
}
