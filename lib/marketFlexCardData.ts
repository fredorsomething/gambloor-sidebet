import { getAddress, isAddress } from "viem";

import { MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { replay, userLegs } from "@/lib/exchange/userStats";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";

export type MarketFlexSide = {
  outcomeIndex: number;
  label: string;
  isWinner: boolean;
  isViewer: boolean;
  viewerLabel: string;
  address?: string;
  avatarUrl: string | null;
  /** e.g. "Won 12.50 USDC.e" or "Lost 8.00 USDC.e" — viewer side only. */
  resultLabel?: string;
};

export type MarketFlexCardData = {
  marketId: number;
  title: string;
  description: string;
  imageUrl: string | null;
  tokenSymbol: string;
  winningOutcome: number;
  winningLabel: string;
  sides: MarketFlexSide[];
  viewerPnl: number;
};

function partyLabel(address: string, username: string | null): string {
  if (username) return `@${username}`;
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatPnlLabel(pnl: number, symbol: string): string {
  const abs = Math.abs(pnl);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 2,
  });
  const verb = pnl >= 0 ? "Won" : "Lost";
  return `${verb} ${formatted} ${symbol}`;
}

function computeSettlementPnl(
  legs: ReturnType<typeof userLegs>,
  winningOutcome: number,
): { netPnl: number; primaryOutcome: number } {
  const { positions, realized } = replay(legs);
  let netPnl = realized.reduce((sum, r) => sum + r.delta, 0);

  const volumeByOutcome = new Map<number, bigint>();
  for (const leg of legs) {
    if (leg.side === "BUY") {
      volumeByOutcome.set(
        leg.outcome,
        (volumeByOutcome.get(leg.outcome) ?? 0n) + leg.shares,
      );
    }
  }

  let primaryOutcome = -1;
  let maxHeld = 0n;
  for (const [key, acc] of positions) {
    const outcome = Number(key.split(":")[1]);
    const qty = acc.qty;
    const cost = Number(acc.cost) / 1_000_000;
    const settlementValue = outcome === winningOutcome ? Number(qty) / 1_000_000 : 0;
    netPnl += settlementValue - cost;
    if (qty > maxHeld) {
      maxHeld = qty;
      primaryOutcome = outcome;
    }
  }

  if (primaryOutcome < 0 && volumeByOutcome.size > 0) {
    let maxVol = 0n;
    for (const [outcome, vol] of volumeByOutcome) {
      if (vol > maxVol) {
        maxVol = vol;
        primaryOutcome = outcome;
      }
    }
  }

  return { netPnl, primaryOutcome };
}

export async function resolveMarketFlexCard(
  marketId: number,
  addressRaw: string,
): Promise<MarketFlexCardData | null> {
  if (!isAddress(addressRaw)) return null;
  const address = getAddress(addressRaw);
  const lower = address.toLowerCase();

  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: marketWithOutcomesSelect,
  });
  if (!market || market.status !== "Resolved" || market.winningOutcome == null) {
    return null;
  }

  const fills = await prisma.fill.findMany({
    where: { marketId, OR: [{ taker: lower }, { maker: lower }] },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  if (fills.length === 0) return null;

  const legs = userLegs(fills, lower);
  const { netPnl, primaryOutcome } = computeSettlementPnl(
    legs,
    market.winningOutcome,
  );

  const user = await prisma.user.findUnique({
    where: { address: lower },
    select: { username: true, avatarUrl: true },
  });

  const tokenSymbol = market.tokenSymbol ?? MARKET_COLLATERAL_SYMBOL;
  const winningLabel =
    market.outcomes.find((o) => o.index === market.winningOutcome)?.label ??
    `Outcome ${market.winningOutcome}`;

  const viewerLabel = partyLabel(address, user?.username ?? null);
  const viewerResultLabel = formatPnlLabel(netPnl, tokenSymbol);

  const orderedOutcomes =
    market.outcomes.length === 2
      ? market.outcomes.slice(0, 2)
      : market.outcomes.filter((o) => o.index === primaryOutcome);

  const sides: MarketFlexSide[] = orderedOutcomes.map((o) => {
    const isViewer = o.index === primaryOutcome;
    return {
      outcomeIndex: o.index,
      label: o.label,
      isWinner: o.index === market.winningOutcome,
      isViewer,
      viewerLabel: isViewer ? viewerLabel : o.label,
      address: isViewer ? address : undefined,
      avatarUrl: isViewer ? user?.avatarUrl ?? null : null,
      resultLabel: isViewer ? viewerResultLabel : undefined,
    };
  });

  if (sides.length === 1) {
    const opposing = market.outcomes.find((o) => o.index !== primaryOutcome);
    if (opposing) {
      sides.push({
        outcomeIndex: opposing.index,
        label: opposing.label,
        isWinner: opposing.index === market.winningOutcome,
        isViewer: false,
        viewerLabel: opposing.label,
        avatarUrl: null,
      });
    }
  }

  return {
    marketId,
    title: market.title,
    description: market.description,
    imageUrl: market.imageUrl,
    tokenSymbol,
    winningOutcome: market.winningOutcome,
    winningLabel,
    sides,
    viewerPnl: netPnl,
  };
}
