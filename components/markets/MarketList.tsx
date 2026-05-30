"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";

import { MarketCard } from "@/components/markets/MarketCard";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";
import { usePlatformSettings } from "@/lib/hooks/usePlatformSettings";
import type { ListMarketsResponse } from "@/lib/types";

const STATUSES = ["Open", "Resolved"] as const;
type Status = (typeof STATUSES)[number];

type Props = {
  defaultStatus?: Status;
  who?: string;
  role?: "creator" | "settler" | "any";
  hideFilters?: boolean;
};

export function MarketList({ defaultStatus = "Open", who, role, hideFilters }: Props) {
  const [status, setStatus] = useState<Status>(defaultStatus);
  const platformQ = usePlatformSettings();
  const allowMarketCreation = platformQ.data?.allowMarketCreation ?? false;

  const params = new URLSearchParams();
  params.set("status", status);
  if (who) params.set("who", who);
  if (role) params.set("role", role);
  params.set("take", "50");

  const query = useQuery<ListMarketsResponse>({
    queryKey: ["markets", { status, who, role }],
    queryFn: () => jsonFetch(`/api/markets?${params.toString()}`),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      {!hideFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`pill ${status === s ? "pill-active" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {query.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-muted/30 border-border/40" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="card p-6 text-sm text-[hsl(var(--danger))]">
          Failed to load markets: {(query.error as Error).message}
        </div>
      )}

      {query.data && query.data.items.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-muted-foreground">
            {allowMarketCreation
              ? "No markets yet."
              : "No markets yet. Market creation is paused — check back later."}
          </p>
          {allowMarketCreation && (
            <Button asChild className="mt-4">
              <Link href="/markets/new">Create the first one</Link>
            </Button>
          )}
        </div>
      )}

      {query.data && query.data.items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.items.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
