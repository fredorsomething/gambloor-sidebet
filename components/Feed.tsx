"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

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

type FeedItem =
  | { kind: "sidebet"; createdAt: string; bet: BetRow }
  | { kind: "market"; createdAt: string; market: MarketRow };

/**
 * Unified markets feed: sidebets (open, matched, and settled) plus CLOB
 * markets (open and resolved), interleaved by recency.
 */
export function Feed() {
  const betsQ = useQuery<ListBetsResponse>({
    queryKey: ["feed", "bets"],
    queryFn: () =>
      jsonFetch(
        `/api/bets?status=Open,Matched,Settled,Refunded&take=100`,
      ),
    refetchInterval: 15_000,
  });
  const marketsQ = useQuery<ListMarketsResponse>({
    queryKey: ["feed", "markets"],
    queryFn: () =>
      jsonFetch(`/api/markets?status=Open,Resolved&take=100`),
    refetchInterval: 15_000,
  });

  const items = useMemo<FeedItem[]>(() => {
    const bets: FeedItem[] = (betsQ.data?.items ?? []).map((bet) => ({
      kind: "sidebet",
      createdAt: bet.createdAt,
      bet,
    }));
    const markets: FeedItem[] = (marketsQ.data?.items ?? []).map((market) => ({
      kind: "market",
      createdAt: market.createdAt,
      market,
    }));
    return [...bets, ...markets].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [betsQ.data, marketsQ.data]);

  const loading = betsQ.isLoading || marketsQ.isLoading;
  const errored = betsQ.isError || marketsQ.isError;

  return (
    <div className="space-y-4">
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card min-h-[280px] animate-pulse border-border/40 bg-muted/30"
            />
          ))}
        </div>
      )}

      {!loading && errored && (
        <div className="card p-6 text-sm text-[hsl(var(--danger))]">
          Failed to load markets. Please try again.
        </div>
      )}

      {!loading && !errored && items.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted-foreground">No markets yet.</p>
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
