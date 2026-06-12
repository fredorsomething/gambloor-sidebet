import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { engineBookOrders, type EngineBookOrder } from "@/lib/engineClient";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export type MarketHolder = {
  address: string;
  /** Total micro-shares held across all outcomes (free + locked). */
  total: string;
  byOutcome: { outcomeIndex: number; shares: string }[];
};

/**
 * Public market social data:
 * - holders: top share holders aggregated from the custodial ledger
 * - orders:  every resting order with its maker (who's bidding/asking at what price)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const marketId = Number(params.id);
  if (!Number.isFinite(marketId) || marketId <= 0) {
    return jsonErr("bad market id", 400);
  }

  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { id: true },
  });
  if (!market) return jsonErr("market not found", 404);

  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit")) || 10, 1),
    50,
  );

  const accounts = await prisma.account.findMany({
    where: {
      marketId,
      kind: "SHARE",
      OR: [{ balance: { gt: 0n } }, { locked: { gt: 0n } }],
    },
    select: {
      owner: true,
      outcomeIndex: true,
      balance: true,
      locked: true,
    },
  });

  const byOwner = new Map<string, Map<number, bigint>>();
  for (const a of accounts) {
    // Skip internal accounts (house / market reserves) — holders are wallets.
    if (!a.owner.startsWith("0x")) continue;
    const shares = a.balance + a.locked;
    if (shares <= 0n) continue;
    let outcomes = byOwner.get(a.owner);
    if (!outcomes) {
      outcomes = new Map();
      byOwner.set(a.owner, outcomes);
    }
    outcomes.set(
      a.outcomeIndex ?? 0,
      (outcomes.get(a.outcomeIndex ?? 0) ?? 0n) + shares,
    );
  }

  const holders: MarketHolder[] = [...byOwner.entries()]
    .map(([address, outcomes]) => {
      let total = 0n;
      const byOutcome = [...outcomes.entries()]
        .map(([outcomeIndex, shares]) => {
          total += shares;
          return { outcomeIndex, shares: shares.toString() };
        })
        .sort((a, b) => a.outcomeIndex - b.outcomeIndex);
      return { address, total, byOutcome };
    })
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
    .slice(0, limit)
    .map((h) => ({ ...h, total: h.total.toString() }));

  // Live resting orders with makers; degrade gracefully if the engine is down.
  let orders: EngineBookOrder[] = [];
  try {
    orders = await engineBookOrders(marketId);
    orders.sort((a, b) => Number(b.price) - Number(a.price));
  } catch {
    orders = [];
  }

  return jsonOk({ holders, orders });
}
