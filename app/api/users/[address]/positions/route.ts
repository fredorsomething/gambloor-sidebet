import { NextRequest } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";

import { MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { formatMicro, formatPrice, SCALE } from "@/lib/exchange/units";
import { replay, userLegs } from "@/lib/exchange/userStats";

export const dynamic = "force-dynamic";

/** A user's stake exposure in live (Open/Matched) sidebets, valued at stake. */
async function loadSidebetExposure(lower: string) {
  const bets = await prisma.bet.findMany({
    where: {
      status: { in: ["Open", "Matched"] },
      OR: [
        { proposer: { equals: lower, mode: "insensitive" } },
        { acceptor: { equals: lower, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  let value = 0;
  const items = bets.map((b) => {
    const isProposer = b.proposer.toLowerCase() === lower;
    const stakeRaw = isProposer
      ? b.proposerStake !== "0"
        ? b.proposerStake
        : b.amount
      : b.acceptorStake !== "0"
        ? b.acceptorStake
        : b.amount;
    let stake = 0;
    try {
      stake = Number(formatUnits(BigInt(stakeRaw || "0"), b.decimals));
    } catch {
      stake = 0;
    }
    value += stake;
    return {
      id: b.id,
      title: b.title,
      imageUrl: b.imageUrl,
      status: b.status,
      tokenSymbol: b.tokenSymbol ?? "USDC.e",
      role: isProposer ? "proposer" : "acceptor",
      stake,
    };
  });

  return { value: Number(value.toFixed(2)), items };
}

/**
 * GET /api/users/[address]/positions
 * Open share holdings across all markets, valued at the last traded price, with
 * average cost basis from fills. Holdings come from the authoritative ledger;
 * resolved markets are already redeemed to collateral so they don't appear.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);
  const lower = address.toLowerCase();

  const [shareAccts, sidebets] = await Promise.all([
    prisma.account.findMany({
      where: { owner: lower, kind: "SHARE" },
      select: { marketId: true, outcomeIndex: true, balance: true, locked: true },
    }),
    loadSidebetExposure(lower),
  ]);
  const held = shareAccts
    .map((s) => ({
      marketId: s.marketId!,
      outcomeIndex: s.outcomeIndex!,
      qty: s.balance + s.locked,
    }))
    .filter((s) => s.qty > 0n);

  if (held.length === 0) {
    return jsonOk({
      totalValue: sidebets.value,
      positionsValue: 0,
      sidebetValue: sidebets.value,
      positions: [],
      sidebets: sidebets.items,
    });
  }

  const marketIds = [...new Set(held.map((h) => h.marketId))];
  const [markets, stats, fills] = await Promise.all([
    prisma.market.findMany({
      where: { id: { in: marketIds } },
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
    }),
    prisma.outcomeStat.findMany({ where: { marketId: { in: marketIds } } }),
    prisma.fill.findMany({
      where: { marketId: { in: marketIds }, OR: [{ taker: lower }, { maker: lower }] },
      orderBy: { createdAt: "asc" },
      take: 4000,
    }),
  ]);

  const marketById = new Map(markets.map((m) => [m.id, m]));
  const lastByKey = new Map<string, bigint>();
  for (const s of stats) {
    if (s.lastPrice != null) lastByKey.set(`${s.marketId}:${s.outcomeIndex}`, s.lastPrice);
  }
  const { positions: costByKey } = replay(userLegs(fills, lower));

  let totalValue = 0;
  const items = held.map((h) => {
    const key = `${h.marketId}:${h.outcomeIndex}`;
    const m = marketById.get(h.marketId);
    const last = lastByKey.get(key) ?? SCALE / 2n; // default to 0.50
    const valueMicro = (last * h.qty) / SCALE;
    const value = Number(formatMicro(valueMicro));
    totalValue += value;
    const acc = costByKey.get(key);
    const avg = acc && acc.qty > 0n ? formatPrice((acc.cost * SCALE) / acc.qty) : "0";
    return {
      marketId: h.marketId,
      title: m?.title ?? `Market ${h.marketId}`,
      imageUrl: m?.imageUrl ?? null,
      status: m?.status ?? "Open",
      tokenSymbol: m?.tokenSymbol ?? MARKET_COLLATERAL_SYMBOL,
      decimals: m?.decimals ?? 6,
      outcomeIndex: h.outcomeIndex,
      label:
        m?.outcomes.find((o) => o.index === h.outcomeIndex)?.label ??
        `Outcome ${h.outcomeIndex}`,
      shares: Number(formatMicro(h.qty)),
      sharesRaw: h.qty.toString(),
      lastPrice: Number(formatPrice(last)),
      value,
      avgPrice: Number(avg),
    };
  });
  items.sort((a, b) => b.value - a.value);

  const positionsValue = Number(totalValue.toFixed(2));
  return jsonOk({
    totalValue: Number((positionsValue + sidebets.value).toFixed(2)),
    positionsValue,
    sidebetValue: sidebets.value,
    positions: items,
    sidebets: sidebets.items,
  });
}
