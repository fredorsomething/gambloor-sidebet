import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { getMarketCollateralToken, MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Taker-fillable shares remaining on a resting order (raw token units). */
function sharesRemainingRaw(o: {
  side: string;
  makerAmount: string;
  takerAmount: string;
  filled: string;
}): bigint {
  const remainingTaker = BigInt(o.takerAmount) - BigInt(o.filled);
  if (remainingTaker <= 0n) return 0n;
  const makerAmount = BigInt(o.makerAmount);
  const takerAmount = BigInt(o.takerAmount) || 1n;
  return o.side === "SELL"
    ? (remainingTaker * makerAmount) / takerAmount
    : remainingTaker;
}

/**
 * GET /api/markets/[id]/portfolio?address=0x...
 * Returns the viewer's open orders, trade history, and per-outcome inventory
 * (shares bought/sold, cost basis, realized proceeds) for this market.
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
    include: { outcomes: { orderBy: { index: "asc" } } },
  });
  if (!market) return jsonErr("not found", 404);

  const labelOf = (idx: number) =>
    market.outcomes.find((o) => o.index === idx)?.label ?? `Outcome ${idx}`;

  // Open orders by this maker.
  const orders = await prisma.order.findMany({
    where: { marketId: id, maker: address, status: "Open" },
    orderBy: { createdAt: "desc" },
  });

  const openOrders = orders
    .map((o) => ({
      hash: o.hash,
      outcomeIndex: o.outcomeIndex,
      label: labelOf(o.outcomeIndex),
      side: o.side,
      price: o.price,
      makerAmount: o.makerAmount,
      takerAmount: o.takerAmount,
      filled: o.filled,
      salt: o.salt,
      expiry: o.expiry.toString(),
      signature: o.signature,
      positionId: o.positionId,
      sharesRemaining: sharesRemainingRaw(o).toString(),
      createdAt: o.createdAt.toISOString(),
    }))
    .filter((o) => BigInt(o.sharesRemaining) > 0n);

  // Trades where this user is taker or maker.
  const trades = await prisma.trade.findMany({
    where: { marketId: id, OR: [{ taker: address }, { maker: address }] },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Normalise each trade to the user's perspective.
  type Norm = {
    outcomeIndex: number;
    label: string;
    side: "BUY" | "SELL"; // user gained shares (BUY) or sold them (SELL)
    shares: string;
    cost: string;
    counterparty: string;
    role: "taker" | "maker";
    txHash: string | null;
    createdAt: string;
  };
  const history: Norm[] = trades.map((t) => {
    const isTaker = t.taker.toLowerCase() === lower;
    // The taker fields are the taker's perspective. The maker fields (when
    // present) are the maker's perspective on their own resting order's
    // outcome — these differ for complementary (cross-outcome) fills. Legacy
    // rows have no maker* fields, so fall back to mirroring the taker side.
    if (isTaker) {
      return {
        outcomeIndex: t.outcomeIndex,
        label: labelOf(t.outcomeIndex),
        side: t.side as "BUY" | "SELL",
        shares: t.shares,
        cost: t.cost,
        counterparty: t.maker,
        role: "taker" as const,
        txHash: t.txHash,
        createdAt: t.createdAt.toISOString(),
      };
    }
    const mOutcome = t.makerOutcomeIndex ?? t.outcomeIndex;
    const mSide =
      (t.makerSide as "BUY" | "SELL" | null) ??
      (t.side === "BUY" ? "SELL" : "BUY");
    return {
      outcomeIndex: mOutcome,
      label: labelOf(mOutcome),
      side: mSide,
      shares: t.makerShares ?? t.shares,
      cost: t.makerCost ?? t.cost,
      counterparty: t.taker,
      role: "maker" as const,
      txHash: t.txHash,
      createdAt: t.createdAt.toISOString(),
    };
  });

  // Per-outcome inventory aggregates (raw token units, summed as bigint).
  const agg = new Map<
    number,
    { bought: bigint; costBought: bigint; sold: bigint; proceeds: bigint }
  >();
  const touch = (idx: number) => {
    if (!agg.has(idx))
      agg.set(idx, { bought: 0n, costBought: 0n, sold: 0n, proceeds: 0n });
    return agg.get(idx)!;
  };
  for (const t of history) {
    const a = touch(t.outcomeIndex);
    if (t.side === "BUY") {
      a.bought += BigInt(t.shares);
      a.costBought += BigInt(t.cost);
    } else {
      a.sold += BigInt(t.shares);
      a.proceeds += BigInt(t.cost);
    }
  }

  const inventory = market.outcomes.map((o) => {
    const a = agg.get(o.index) ?? {
      bought: 0n,
      costBought: 0n,
      sold: 0n,
      proceeds: 0n,
    };
    return {
      outcomeIndex: o.index,
      label: o.label,
      positionId: o.positionId,
      sharesBought: a.bought.toString(),
      costBought: a.costBought.toString(),
      sharesSold: a.sold.toString(),
      proceeds: a.proceeds.toString(),
    };
  });

  const collateral = getMarketCollateralToken();
  return jsonOk({
    decimals: collateral.decimals,
    tokenSymbol: MARKET_COLLATERAL_SYMBOL,
    openOrders,
    trades: history,
    inventory,
  });
}
