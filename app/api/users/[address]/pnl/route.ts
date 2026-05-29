import { NextRequest } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function dollars(raw: string, decimals: number): number {
  try {
    return Number(formatUnits(BigInt(raw), decimals));
  } catch {
    return 0;
  }
}

type PnlEvent = { t: number; delta: number };

/**
 * GET /api/users/[address]/pnl
 * Builds a realized-PnL timeline from settled sidebets and CLOB trade history,
 * returned as cumulative points the client can window by time range.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);

  const events: PnlEvent[] = [];

  // --- Sidebet settlements -------------------------------------------------
  const bets = await prisma.bet.findMany({
    where: {
      status: "Settled",
      OR: [
        { proposer: { equals: address, mode: "insensitive" } },
        { acceptor: { equals: address, mode: "insensitive" } },
      ],
    },
    select: {
      proposer: true,
      acceptor: true,
      amount: true,
      decimals: true,
      feeBps: true,
      winner: true,
      updatedAt: true,
    },
  });
  for (const b of bets) {
    if (!eq(b.proposer, address) && !eq(b.acceptor, address)) continue;
    const stake = dollars(b.amount, b.decimals);
    let delta = 0;
    if (b.winner) {
      const fee = stake * 2 * (b.feeBps / 10000);
      delta = eq(b.winner, address) ? stake - fee : -stake;
    }
    if (delta !== 0) events.push({ t: b.updatedAt.getTime(), delta });
  }

  // --- CLOB trades: realized PnL via running average cost basis ------------
  const trades = await prisma.trade.findMany({
    where: {
      OR: [
        { taker: { equals: address, mode: "insensitive" } },
        { maker: { equals: address, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { market: { select: { decimals: true } } },
  });

  // Per (marketId:outcomeIndex) running position.
  const pos = new Map<string, { qty: number; cost: number }>();
  const lower = address.toLowerCase();
  for (const t of trades) {
    const decimals = t.market?.decimals ?? 6;
    const isTaker = t.taker.toLowerCase() === lower;
    const userSide = isTaker
      ? (t.side as "BUY" | "SELL")
      : t.side === "BUY"
        ? "SELL"
        : "BUY";
    const shares = dollars(t.shares, decimals);
    const cost = dollars(t.cost, decimals);
    if (shares <= 0) continue;

    const key = `${t.marketId}:${t.outcomeIndex}`;
    const p = pos.get(key) ?? { qty: 0, cost: 0 };

    if (userSide === "BUY") {
      p.qty += shares;
      p.cost += cost;
      pos.set(key, p);
    } else {
      // Realize PnL against average cost.
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      const sold = Math.min(shares, p.qty > 0 ? p.qty : shares);
      const realized = cost - avg * sold;
      // Reduce the position.
      p.cost -= avg * Math.min(sold, p.qty);
      p.qty = Math.max(0, p.qty - shares);
      pos.set(key, p);
      if (realized !== 0)
        events.push({ t: t.createdAt.getTime(), delta: realized });
    }
  }

  events.sort((a, b) => a.t - b.t);

  let cum = 0;
  const points = events.map((e) => {
    cum += e.delta;
    return { t: e.t, pnl: Number(cum.toFixed(4)) };
  });

  return jsonOk({ points, total: Number(cum.toFixed(2)) });
}
