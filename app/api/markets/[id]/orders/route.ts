import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, parseEventLogs, parseAbiItem } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPublicClient } from "@/lib/onchain";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  enginePlaceOrder,
  engineCreditDeposit,
  EngineError,
} from "@/lib/engineClient";
import {
  MAX_PRICE,
  MIN_PRICE,
  costOf,
  feeOf,
  parseAmount,
  parsePrice,
} from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

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
    include: { outcomes: true },
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

  // Just-in-time funding: a BUY must arrive with a confirmed on-chain transfer
  // of at least the order's collateral (cost + fee) to the treasury. We verify
  // it, credit the ledger, and then place — so funds leave the wallet only when
  // the order is posted. USDC.e has 6 decimals, matching our micro-units 1:1.
  if (d.side === "BUY") {
    if (!d.fundingTxHash) {
      return jsonErr("buy orders must include a funding transfer", 400);
    }
    const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
    if (!treasuryRaw) return jsonErr("treasury not configured", 503);

    const publicClient = getPublicClient(market.chainId);
    if (!publicClient) return jsonErr("unsupported chain", 400);

    const required = costOf(priceMicro, qtyMicro) + feeOf(costOf(priceMicro, qtyMicro), market.feeBps);

    let transferred = 0n;
    let fundingLogIndex = -1;
    try {
      const treasury = getAddress(treasuryRaw);
      const token = getAddress(market.token);
      const receipt = await publicClient.getTransactionReceipt({
        hash: d.fundingTxHash as `0x${string}`,
      });
      if (receipt.status !== "success") {
        return jsonErr("funding transfer did not succeed", 400);
      }
      const transfers = parseEventLogs({
        abi: [TRANSFER_EVENT],
        logs: receipt.logs,
        eventName: "Transfer",
      });
      for (const t of transfers) {
        if (getAddress(t.address) !== token) continue;
        if (getAddress(t.args.from) !== maker) continue;
        if (getAddress(t.args.to) !== treasury) continue;
        transferred += t.args.value;
        if (fundingLogIndex < 0) fundingLogIndex = t.logIndex;
      }
    } catch (err) {
      console.error("funding verification failed", err);
      return jsonErr("could not verify funding transfer", 400);
    }

    if (fundingLogIndex < 0 || transferred < required) {
      return jsonErr("funding transfer is insufficient for this order", 400);
    }

    try {
      // Idempotent per (txHash, logIndex). If it returns `credited: false`, the
      // funds were already credited (e.g. the bridge indexed the same transfer,
      // or this tx was reused). Either way the engine's free-balance check below
      // enforces single use, so we can safely proceed.
      await engineCreditDeposit({
        address: maker.toLowerCase(),
        amount: transferred.toString(),
        txHash: d.fundingTxHash,
        logIndex: fundingLogIndex,
        chainId: market.chainId,
      });
    } catch (err) {
      if (err instanceof EngineError) return jsonErr(err.message, err.status);
      console.error("credit deposit failed", err);
      return jsonErr("failed to credit funding", 500);
    }
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
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("place order failed", err);
    return jsonErr("failed to place order", 500);
  }
}
