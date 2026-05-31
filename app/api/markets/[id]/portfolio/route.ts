import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { getMarketCollateralToken, MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineOpenOrders, EngineError } from "@/lib/engineClient";
import { collateralKey } from "@/lib/exchange/keys";
import { formatMicro, formatPrice } from "@/lib/exchange/units";
import { replay, userLegs } from "@/lib/exchange/userStats";

export const dynamic = "force-dynamic";

/**
 * GET /api/markets/[id]/portfolio?address=0x...
 * Viewer's open orders (from the engine), per-outcome positions and average
 * cost (from the ledger + fills) and recent fill history for this market.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const addrRaw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(addrRaw)) return jsonErr("bad address", 400);
  const address = getAddress(addrRaw);
  const lower = address.toLowerCase();

  const market = await prisma.market.findUnique({
    where: { id },
    select: marketWithOutcomesSelect,
  });
  if (!market) return jsonErr("not found", 404);
  const labelOf = (idx: number) =>
    market.outcomes.find((o) => o.index === idx)?.label ?? `Outcome ${idx}`;

  // Open orders from the engine (degrade gracefully if it's down).
  let openOrders: {
    id: string;
    outcomeIndex: number;
    label: string;
    side: "BUY" | "SELL";
    price: string;
    shares: string;
    createdAt: number;
  }[] = [];
  try {
    const eng = await engineOpenOrders(id, lower);
    openOrders = eng.map((o) => ({
      id: o.id,
      outcomeIndex: o.outcomeIndex,
      label: labelOf(o.outcomeIndex),
      side: o.side,
      price: formatPrice(BigInt(o.price)),
      shares: formatMicro(BigInt(o.remaining)),
      createdAt: o.createdAt,
    }));
  } catch (err) {
    if (!(err instanceof EngineError)) console.error("openOrders failed", err);
  }

  // Authoritative share holdings from the ledger.
  const shareAccts = await prisma.account.findMany({
    where: { owner: lower, kind: "SHARE", marketId: id },
    select: { outcomeIndex: true, balance: true, locked: true },
  });
  const heldByOutcome = new Map<number, bigint>();
  for (const s of shareAccts) {
    if (s.outcomeIndex == null) continue;
    heldByOutcome.set(s.outcomeIndex, s.balance + s.locked);
  }

  // Average cost basis from fills.
  const fills = await prisma.fill.findMany({
    where: { marketId: id, OR: [{ taker: lower }, { maker: lower }] },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  const { positions } = replay(userLegs(fills, lower));

  const inventory = market.outcomes.map((o) => {
    const held = heldByOutcome.get(o.index) ?? 0n;
    const acc = positions.get(`${id}:${o.index}`);
    const avg =
      acc && acc.qty > 0n ? formatPrice((acc.cost * 1_000_000n) / acc.qty) : "0";
    return {
      outcomeIndex: o.index,
      label: o.label,
      shares: formatMicro(held),
      sharesMicro: held.toString(),
      avgPrice: avg,
    };
  });

  // Recent fill history from this user's perspective.
  const legs = userLegs(fills, lower).slice(-200).reverse();
  const trades = legs.map((leg, i) => ({
    id: `${id}-${i}-${leg.t}`,
    outcomeIndex: leg.outcome,
    label: labelOf(leg.outcome),
    side: leg.side,
    shares: formatMicro(leg.shares),
    cost: formatMicro(leg.cost),
    price: leg.shares > 0n ? formatPrice((leg.cost * 1_000_000n) / leg.shares) : "0",
    createdAt: new Date(leg.t).toISOString(),
  }));

  const coll = await prisma.account.findUnique({
    where: { key: collateralKey(lower) },
    select: { balance: true, locked: true },
  });

  const collateral = getMarketCollateralToken();
  return jsonOk({
    decimals: collateral.decimals,
    tokenSymbol: MARKET_COLLATERAL_SYMBOL,
    collateral: {
      balance: (coll?.balance ?? 0n).toString(),
      locked: (coll?.locked ?? 0n).toString(),
    },
    openOrders,
    inventory,
    trades,
  });
}
