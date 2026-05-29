"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/profile/Identity";
import { StatusBadge } from "@/components/ui/badge";
import { jsonFetch } from "@/lib/fetcher";
import { formatToken, shortAddr } from "@/lib/utils";
import type { BetStatusName } from "@/lib/abi";

type SearchResults = {
  markets: {
    id: number;
    title: string;
    status: BetStatusName;
    amount: string;
    decimals: number;
    tokenSymbol: string | null;
  }[];
  users: {
    address: string;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
  }[];
};

function Results() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const { data, isLoading } = useQuery<SearchResults>({
    queryKey: ["search-page", q],
    enabled: q.trim().length >= 1,
    queryFn: () => jsonFetch(`/api/search?q=${encodeURIComponent(q.trim())}`),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Results for <span className="font-medium text-foreground">“{q}”</span>
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Searching…</div>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Users</h2>
        {data && data.users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users found.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.users.map((u) => (
            <Link
              key={u.address}
              href={`/u/${u.address}`}
              className="card flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
            >
              <Avatar address={u.address} url={u.avatarUrl} size={44} />
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {u.username || shortAddr(u.address)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.bio || shortAddr(u.address)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Markets</h2>
        {data && data.markets.length === 0 && (
          <p className="text-sm text-muted-foreground">No markets found.</p>
        )}
        <div className="space-y-2">
          {data?.markets.map((m) => (
            <Link
              key={m.id}
              href={`/bets/${m.id}`}
              className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {m.title}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">
                  {formatToken(BigInt(m.amount), m.decimals)} {m.tokenSymbol}
                </span>
                <StatusBadge status={m.status} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <Results />
    </Suspense>
  );
}
