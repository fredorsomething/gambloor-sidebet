import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, hashTypedData, type Address } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { ORDER_EIP712_TYPES, exchangeDomain } from "@/lib/clob";
import { computeOrderPrice, verifyOrderSignature } from "@/lib/marketsServer";

export const dynamic = "force-dynamic";

const DECIMAL = /^[0-9]+$/;

const OrderSchema = z.object({
  outcomeIndex: z.number().int().min(0).max(15),
  side: z.enum(["BUY", "SELL"]),
  salt: z.string().regex(DECIMAL),
  maker: z.string(),
  tokenId: z.string().regex(DECIMAL),
  makerAmount: z.string().regex(DECIMAL),
  takerAmount: z.string().regex(DECIMAL),
  expiration: z.string().regex(DECIMAL),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

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

  const market = await prisma.market.findUnique({
    where: { id },
    include: { outcomes: true },
  });
  if (!market) return jsonErr("market not found", 404);
  if (market.status !== "Open") return jsonErr("market is resolved", 400);

  const outcome = market.outcomes.find((o) => o.index === d.outcomeIndex);
  if (!outcome) return jsonErr("bad outcome index", 400);
  if (outcome.positionId !== d.tokenId) {
    return jsonErr("tokenId does not match outcome positionId", 400);
  }

  const sideNum = d.side === "BUY" ? 0 : 1;

  // Verify the maker's EIP-712 signature.
  const valid = await verifyOrderSignature(
    { ...d, side: sideNum },
    market.chainId,
    getAddress(market.exchangeAddress) as Address,
  );
  if (!valid) return jsonErr("invalid order signature", 400);

  // Derive the canonical order hash (matches CTFExchange.hashOrder).
  const hash = hashTypedData({
    domain: exchangeDomain(
      market.chainId,
      getAddress(market.exchangeAddress) as Address,
    ),
    types: ORDER_EIP712_TYPES,
    primaryType: "Order",
    message: {
      salt: BigInt(d.salt),
      maker: getAddress(d.maker),
      tokenId: BigInt(d.tokenId),
      makerAmount: BigInt(d.makerAmount),
      takerAmount: BigInt(d.takerAmount),
      expiration: BigInt(d.expiration),
      side: sideNum,
    },
  });

  const price = computeOrderPrice({
    side: sideNum,
    makerAmount: d.makerAmount,
    takerAmount: d.takerAmount,
  });

  try {
    const order = await prisma.order.upsert({
      where: { hash },
      update: {},
      create: {
        hash,
        marketId: id,
        maker: getAddress(d.maker),
        side: d.side,
        outcomeIndex: d.outcomeIndex,
        positionId: d.tokenId,
        price,
        makerAmount: d.makerAmount,
        takerAmount: d.takerAmount,
        salt: d.salt,
        expiry: BigInt(d.expiration),
        signature: d.signature,
        status: "Open",
      },
    });
    return jsonOk(order, { status: 201 });
  } catch (err) {
    console.error("create order failed", err);
    return jsonErr("failed to store order", 500);
  }
}
