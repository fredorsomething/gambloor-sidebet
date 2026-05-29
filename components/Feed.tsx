"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BetCard } from "@/components/BetCard";
import { MarketCard } from "@/components/markets/MarketCard";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";
import type {
  BetRow,
  ListBetsResponse,
  ListMarketsResponse,
  MarketRow,
} from "@/lib/types";

type Filter = "all" | "markets" | "sidebets";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "markets", label: "Markets" },
  { id: "sidebets", label: "Sidebets" },
];

type FeedItem =
  | { kind: "sidebet"; createdAt: string; bet: BetRow }
  | { kind: "market"; createdAt: string; market: MarketRow };

/**
 * Unified discovery feed: open markets and sidebets interleaved by recency,
 * each tagged with its product type. A filter narrows to one kind.
 */
export function Feed() {
  const [filter, setFilter] = useState<Filter>("all");

  const betsQ = useQuery<ListBetsResponse>({
    queryKey: ["feed", "bets"],
    queryFn: () => jsonFetch(`/api/bets?status=Open&take=50`),
    refetchInterval: 15_000,
  });
  const marketsQ = useQuery<ListMarketsResponse>({
    queryKey: ["feed", "markets"],
    queryFn: () => jsonFetch(`/api/markets?status=Open&take=50`),
    refetchInterval: 15_000,
  });

  const items = useMemo<FeedItem[]>(() => {
    const bets: FeedItem[] =
      filter === "markets"
        ? []
        : (betsQ.data?.items ?? []).map((bet) => ({
            kind: "sidebet",
            createdAt: bet.createdAt,
            bet,
          }));
    const markets: FeedItem[] =
      filter === "sidebets"
        ? []
        : (marketsQ.data?.items ?? []).map((market) => ({
            kind: "market",
            createdAt: market.createdAt,
            market,
          }));
    return [...bets, ...markets].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [betsQ.data, marketsQ.data, filter]);

  const loading =
    (filter !== "markets" && betsQ.isLoading) ||
    (filter !== "sidebets" && marketsQ.isLoading);
  const errored =
    (filter !== "markets" && betsQ.isError) ||
    (filter !== "sidebets" && marketsQ.isError);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`pill ${filter === f.id ? "pill-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card h-56 animate-pulse border-border/40 bg-muted/30"
            />
          ))}
        </div>
      )}

      {!loading && errored && (
        <div className="card p-6 text-sm text-[hsl(var(--danger))]">
          Failed to load the feed. Please try again.
        </div>
      )}

      {!loading && !errored && items.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted-foreground">Nothing open right now.</p>
          <Button asChild className="mt-4">
            <Link href="/create">Create the first one</Link>
          </Button>
        </div>
      )}

      {!loading && !errored && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) =>
            item.kind === "sidebet" ? (
              <BetCard key={`sidebet-${item.bet.id}`} bet={item.bet} />
            ) : (
              <MarketCard
                key={`market-${item.market.id}`}
                market={item.market}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
