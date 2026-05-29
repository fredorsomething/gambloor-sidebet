import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { enginePlaceOrder, EngineError } from "@/lib/engineClient";
import { MAX_PRICE, MIN_PRICE, parseAmount, parsePrice } from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

const OrderSchema = z.object({
  maker: z.string(),
  side: z.enum(["BUY", "SELL"]),
  outcomeIndex: z.number().int().min(0).max(15),
  type: z.enum(["LIMIT", "MARKET"]).default("LIMIT"),
  // Probability in (0,1) for LIMIT orders.
  price: z.number().gt(0).lt(1).optional(),
  // Share quantity in whole shares (e.g. 12.5).
  shares: z.number().gt(0),
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
