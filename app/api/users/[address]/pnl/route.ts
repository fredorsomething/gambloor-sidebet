import { NextRequest } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { SCALE } from "@/lib/exchange/units";
import { replay, userLegs } from "@/lib/exchange/userStats";

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
 * Realized-PnL timeline from settled sidebets plus CLOB activity: realized
 * trading PnL on sells AND market-resolution payouts (winning shares redeemed
 * at 1, losing shares at 0).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);
  const lower = address.toLowerCase();

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

  // --- CLOB trades: realized PnL on sells ----------------------------------
  const fills = await prisma.fill.findMany({
    where: { OR: [{ taker: lower }, { maker: lower }] },
    orderBy: { createdAt: "asc" },
  });
  const { positions, realized } = replay(userLegs(fills, lower));
  for (const r of realized) events.push({ t: r.t, delta: r.delta });

  // --- Market resolution payouts ------------------------------------------
  const remainingKeys = [...positions.entries()].filter(([, p]) => p.qty > 0n);
  if (remainingKeys.length > 0) {
    const marketIds = [...new Set(remainingKeys.map(([k]) => Number(k.split(":")[0])))];
    const resolved = await prisma.market.findMany({
      where: { id: { in: marketIds }, status: "Resolved" },
      select: { id: true, winningOutcome: true, updatedAt: true },
    });
    const resolvedById = new Map(resolved.map((m) => [m.id, m]));
    for (const [key, p] of remainingKeys) {
      const [mId, outcome] = key.split(":").map(Number);
      const m = resolvedById.get(mId);
      if (!m) continue;
      const payoutMicro = m.winningOutcome === outcome ? p.qty : 0n; // 1 micro-USDC / micro-share
      const realizedMicro = payoutMicro - p.cost;
      const delta = Number(realizedMicro) / Number(SCALE);
      if (delta !== 0) events.push({ t: m.updatedAt.getTime(), delta });
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
