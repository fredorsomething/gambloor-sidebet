"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";

import { BetCard } from "@/components/BetCard";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";
import type { ListBetsResponse } from "@/lib/types";

const STATUSES = ["Open", "Matched", "Settled", "Cancelled", "Refunded"] as const;
type Status = (typeof STATUSES)[number];

type Props = {
  defaultStatus?: Status;
  who?: string;
  role?: "proposer" | "acceptor" | "settler" | "any";
  chainId?: number;
  hideFilters?: boolean;
  emptyState?: React.ReactNode;
};

export function BetList({
  defaultStatus = "Open",
  who,
  role,
  chainId,
  hideFilters,
  emptyState,
}: Props) {
  const [status, setStatus] = useState<Status>(defaultStatus);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (who) params.set("who", who);
  if (role) params.set("role", role);
  if (chainId) params.set("chainId", String(chainId));
  params.set("take", "50");

  const query = useQuery<ListBetsResponse>({
    queryKey: ["bets", { status, who, role, chainId }],
    queryFn: () => jsonFetch(`/api/bets?${params.toString()}`),
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
            <div
              key={i}
              className="card h-36 animate-pulse bg-muted/30 border-border/40"
            />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="card p-6 text-sm text-[hsl(var(--danger))]">
          Failed to load bets: {(query.error as Error).message}
        </div>
      )}

      {query.data && query.data.items.length === 0 && (
        emptyState ?? (
          <div className="card p-10 text-center">
            <p className="text-muted-foreground">No bets yet.</p>
            <Button asChild className="mt-4">
              <Link href="/bets/new">Propose the first one</Link>
            </Button>
          </div>
        )
      )}

      {query.data && query.data.items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.items.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
