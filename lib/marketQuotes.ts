import type { MarketQuote } from "@/lib/types";

const SCALE = 1_000_000;

export function microToProb(micro: bigint | null | undefined): number | null {
  if (micro == null) return null;
  return Number(micro) / SCALE;
}

/** Build per-outcome bid/ask/mid from OutcomeStat rows (micro prices). */
export function buildMarketQuotes(
  outcomeIndexes: number[],
  stats: {
    outcomeIndex: number;
    bestBid: bigint | null;
    bestAsk: bigint | null;
  }[],
): MarketQuote[] {
  const byIndex = new Map(
    stats.map((s) => [
      s.outcomeIndex,
      {
        bestBid: microToProb(s.bestBid),
        bestAsk: microToProb(s.bestAsk),
      },
    ]),
  );
  return outcomeIndexes.map((index) => {
    const lvl = byIndex.get(index);
    const bestBid = lvl?.bestBid ?? null;
    const bestAsk = lvl?.bestAsk ?? null;
    const mid =
      bestBid != null && bestAsk != null
        ? (bestBid + bestAsk) / 2
        : (bestAsk ?? bestBid);
    return { index, bestBid, bestAsk, mid };
  });
}

export function formatMarketPrice(prob: number | null | undefined): string | null {
  if (prob == null || !Number.isFinite(prob)) return null;
  return `${(prob * 100).toFixed(1)}¢`;
}

export type MarketStatusKind =
  | "open"
  | "pending"
  | "resolved"
  | "rejected"
  | "awaiting";

/** Human label + tone for market embed cards. */
export function marketDisplayStatus(args: {
  status: string;
  verifiedOutcome: number | null;
}): { label: string; kind: MarketStatusKind } {
  if (args.status === "Resolved") {
    return { label: "Resolved", kind: "resolved" };
  }
  if (args.status === "Pending") {
    return { label: "Awaiting approval", kind: "pending" };
  }
  if (args.status === "Rejected") {
    return { label: "Not approved", kind: "rejected" };
  }
  if (args.status === "Open" && args.verifiedOutcome != null) {
    return { label: "Awaiting settlement", kind: "awaiting" };
  }
  return { label: args.status === "Open" ? "Open" : args.status, kind: "open" };
}

/** Primary implied probability for a binary Yes/No market (outcome 0). */
export function binaryYesProbability(quotes: MarketQuote[]): number | null {
  const q0 = quotes.find((q) => q.index === 0);
  const q1 = quotes.find((q) => q.index === 1);
  return q0?.mid ?? q0?.bestAsk ?? (q1?.mid != null ? 1 - q1.mid : null);
}
