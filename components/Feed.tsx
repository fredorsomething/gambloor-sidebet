"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BetCard } from "@/components/BetCard";
import { MarketCard } from "@/components/markets/MarketCard";
import { Button } from "@/components/ui/button";
import { sidebetPoolWei } from "@/lib/betEconomics";
import { resolveBetStatus } from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type {
  BetRow,
  ListBetsResponse,
  ListMarketsResponse,
  MarketRow,
} from "@/lib/types";

type FeedItem =
  | { kind: "sidebet"; createdAt: string; bet: BetRow }
  | { kind: "market"; createdAt: string; market: MarketRow };

const FEED_FILTERS = ["All", "Open", "Matched", "Settled"] as const;
type FeedFilter = (typeof FEED_FILTERS)[number];

const FEED_SORTS = ["Newest", "Highest stake", "Lowest stake"] as const;
type FeedSort = (typeof FEED_SORTS)[number];

function feedItemPool(item: FeedItem): bigint {
  return item.kind === "sidebet" ? sidebetPoolWei(item.bet) : 0n;
}

function compareFeedItems(a: FeedItem, b: FeedItem, sort: FeedSort): number {
  if (sort === "Newest") {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }

  const poolDiff =
    sort === "Highest stake"
      ? feedItemPool(b) > feedItemPool(a)
        ? 1
        : feedItemPool(b) < feedItemPool(a)
          ? -1
          : 0
      : feedItemPool(a) > feedItemPool(b)
        ? 1
        : feedItemPool(a) < feedItemPool(b)
          ? -1
          : 0;

  return poolDiff !== 0
    ? poolDiff
    : Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function matchesFeedFilter(item: FeedItem, filter: FeedFilter): boolean {
  if (filter === "All") return true;
  if (item.kind === "sidebet") {
    const status = resolveBetStatus(item.bet);
    if (filter === "Open") return status === "Open";
    if (filter === "Matched") return status === "Matched";
    return status === "Settled" || status === "Refunded";
  }
  if (filter === "Open") return item.market.status === "Open";
  if (filter === "Matched") return false;
  return item.market.status === "Resolved";
}

function emptyMessage(filter: FeedFilter): string {
  switch (filter) {
    case "All":
      return "No markets yet.";
    case "Open":
      return "No open markets right now.";
    case "Matched":
      return "No matched bets awaiting settlement.";
    case "Settled":
      return "No settled bets yet.";
  }
}

/**
 * Unified markets feed: sidebets (open, matched, and settled) plus CLOB
 * markets (open and resolved), interleaved by recency.
 */
export function Feed() {
  const [filter, setFilter] = useState<FeedFilter>("All");
  const [sort, setSort] = useState<FeedSort>("Newest");

  const betsQ = useQuery<ListBetsResponse>({
    queryKey: ["feed", "bets"],
    queryFn: () =>
      jsonFetch(
        `/api/bets?status=Open,Matched,Settled,Refunded&take=100`,
      ),
    refetchInterval: 4_000,
  });
  const marketsQ = useQuery<ListMarketsResponse>({
    queryKey: ["feed", "markets"],
    queryFn: () =>
      jsonFetch(`/api/markets?status=Open,Resolved&take=100`),
    refetchInterval: 15_000,
  });

  const { featuredBet, gridItems } = useMemo(() => {
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
    const filtered = [...bets, ...markets].filter((item) =>
      matchesFeedFilter(item, filter),
    );

    const sidebets = filtered.filter(
      (item): item is Extract<FeedItem, { kind: "sidebet" }> =>
        item.kind === "sidebet",
    );
    const topSidebet =
      sidebets.length > 0
        ? sidebets.reduce((best, item) =>
            sidebetPoolWei(item.bet) > sidebetPoolWei(best.bet) ? item : best,
          )
        : null;
    const featured =
      topSidebet && sidebetPoolWei(topSidebet.bet) > 0n ? topSidebet : null;

    const sorted = filtered
      .filter(
        (item) =>
          !(
            featured &&
            item.kind === "sidebet" &&
            item.bet.id === featured.bet.id
          ),
      )
      .sort((a, b) => compareFeedItems(a, b, sort));

    return { featuredBet: featured, gridItems: sorted };
  }, [betsQ.data, marketsQ.data, filter, sort]);

  const loading = betsQ.isLoading || marketsQ.isLoading;
  const errored = betsQ.isError || marketsQ.isError;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FEED_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sort</span>
          {FEED_SORTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                sort === s
                  ? "bg-muted text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card min-h-[220px] animate-pulse border-border/40 bg-muted/30"
            />
          ))}
        </div>
      )}

      {!loading && errored && (
        <div className="card p-6 text-sm text-[hsl(var(--danger))]">
          Failed to load markets. Please try again.
        </div>
      )}

      {!loading && !errored && !featuredBet && gridItems.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted-foreground">{emptyMessage(filter)}</p>
          {(filter === "All" || filter === "Open") && (
            <Button asChild className="mt-4">
              <Link href="/create">Create the first one</Link>
            </Button>
          )}
        </div>
      )}

      {!loading && !errored && (featuredBet || gridItems.length > 0) && (
        <div className="space-y-3">
          {featuredBet && (
            <BetCard bet={featuredBet.bet} featured />
          )}
          {gridItems.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {gridItems.map((item) =>
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
      )}
    </div>
  );
}
