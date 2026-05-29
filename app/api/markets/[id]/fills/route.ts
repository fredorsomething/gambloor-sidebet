import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const DECIMAL = /^[0-9]+$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;

const FillSchema = z.object({
  orderHash: z.string(),
  taker: z.string(),
  shares: z.string().regex(DECIMAL), // outcome shares moved
  cost: z.string().regex(DECIMAL), // collateral moved
  takerFillAmount: z.string().regex(DECIMAL), // taker-side amount filled (for filled tracking)
  txHash: z.string().regex(HEX64).optional(),
});

/**
 * Records a taker fill after the on-chain `fillOrder` tx confirms. Updates the
 * resting order's filled amount + status and inserts a Trade. The chain is the
 * source of truth; this keeps the off-chain book in sync for display.
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
  const parsed = FillSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  const order = await prisma.order.findUnique({ where: { hash: d.orderHash } });
  if (!order || order.marketId !== id) return jsonErr("order not found", 404);

  const newFilled = BigInt(order.filled) + BigInt(d.takerFillAmount);
  const fullyFilled = newFilled >= BigInt(order.takerAmount);

  try {
    await prisma.$transaction([
      prisma.order.update({
        where: { hash: d.orderHash },
        data: {
          filled: newFilled.toString(),
          status: fullyFilled ? "Filled" : "Open",
        },
      }),
      prisma.trade.create({
        data: {
          marketId: id,
          orderHash: d.orderHash,
          taker: getAddress(d.taker),
          maker: order.maker,
          // Taker's side is the opposite of the maker's order side.
          side: order.side === "BUY" ? "SELL" : "BUY",
          outcomeIndex: order.outcomeIndex,
          positionId: order.positionId,
          shares: d.shares,
          cost: d.cost,
          txHash: d.txHash ?? null,
        },
      }),
    ]);
    return jsonOk({ ok: true });
  } catch (err) {
    console.error("record fill failed", err);
    return jsonErr("failed to record fill", 500);
  }
}
