import { NextRequest } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/[address]/positions
 * Aggregates the user's open CLOB market positions across every market: net
 * shares held per outcome and the capital tied up in them (running average cost
 * basis). The total value is the sum of that cost basis — so buying a position
 * moves value out of the wallet into "positions" rather than disappearing.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);
  const lower = address.toLowerCase();

  const trades = await prisma.trade.findMany({
    where: {
      OR: [
        { taker: { equals: address, mode: "insensitive" } },
        { maker: { equals: address, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      market: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          status: true,
          decimals: true,
          tokenSymbol: true,
          winningOutcome: true,
          outcomes: { select: { index: true, label: true } },
        },
      },
    },
    take: 2000,
  });

  type Acc = {
    marketId: number;
    title: string;
    imageUrl: string | null;
    status: string;
    decimals: number;
    tokenSymbol: string | null;
    winningOutcome: number | null;
    outcomeIndex: number;
    label: string;
    qty: bigint; // net shares held (raw units)
    cost: bigint; // remaining cost basis for held shares (raw units)
  };

  const positions = new Map<string, Acc>();

  for (const t of trades) {
    const m = t.market;
    if (!m) continue;
    const isTaker = t.taker.toLowerCase() === lower;
    // Taker fields are the taker's perspective; maker fields (when present) are
    // the maker's perspective on their own outcome — these differ for
    // complementary (cross-outcome) fills. Legacy rows mirror the taker side.
    const userOutcome = isTaker
      ? t.outcomeIndex
      : t.makerOutcomeIndex ?? t.outcomeIndex;
    const userSide = isTaker
      ? (t.side as "BUY" | "SELL")
      : ((t.makerSide as "BUY" | "SELL" | null) ??
        (t.side === "BUY" ? "SELL" : "BUY"));

    const shares = BigInt(
      isTaker ? t.shares : t.makerShares ?? t.shares,
    );
    const cost = BigInt(isTaker ? t.cost : t.makerCost ?? t.cost);
    if (shares <= 0n) continue;

    const key = `${t.marketId}:${userOutcome}`;
    let acc = positions.get(key);
    if (!acc) {
      acc = {
        marketId: t.marketId,
        title: m.title,
        imageUrl: m.imageUrl,
        status: m.status,
        decimals: m.decimals,
        tokenSymbol: m.tokenSymbol,
        winningOutcome: m.winningOutcome,
        outcomeIndex: userOutcome,
        label:
          m.outcomes.find((o) => o.index === userOutcome)?.label ??
          `Outcome ${userOutcome}`,
        qty: 0n,
        cost: 0n,
      };
      positions.set(key, acc);
    }

    if (userSide === "BUY") {
      acc.qty += shares;
      acc.cost += cost;
    } else {
      // Reduce holdings at the running average cost.
      const sold = shares > acc.qty ? acc.qty : shares;
      const costOut = acc.qty > 0n ? (acc.cost * sold) / acc.qty : 0n;
      acc.qty -= sold;
      acc.cost -= costOut;
    }
  }

  let totalValue = 0;
  const items = [...positions.values()]
    .filter((p) => p.qty > 0n)
    .map((p) => {
      const value = Number(formatUnits(p.cost, p.decimals));
      const shares = Number(formatUnits(p.qty, p.decimals));
      totalValue += value;
      return {
        marketId: p.marketId,
        title: p.title,
        imageUrl: p.imageUrl,
        status: p.status,
        tokenSymbol: p.tokenSymbol,
        decimals: p.decimals,
        outcomeIndex: p.outcomeIndex,
        label: p.label,
        isWinner:
          p.status === "Resolved" && p.winningOutcome === p.outcomeIndex,
        shares,
        sharesRaw: p.qty.toString(),
        costBasis: value,
        avgPrice: shares > 0 ? value / shares : 0,
      };
    })
    .sort((a, b) => b.costBasis - a.costBasis);

  return jsonOk({ totalValue: Number(totalValue.toFixed(2)), positions: items });
}
