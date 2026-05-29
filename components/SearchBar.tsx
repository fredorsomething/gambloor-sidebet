"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { StatusBadge } from "@/components/ui/badge";
import { jsonFetch } from "@/lib/fetcher";
import { formatToken, shortAddr } from "@/lib/utils";
import type { BetStatusName } from "@/lib/abi";

type SearchResults = {
  bets: {
    id: number;
    title: string;
    imageUrl: string | null;
    status: BetStatusName;
    amount: string;
    decimals: number;
    tokenSymbol: string | null;
  }[];
  markets: {
    id: number;
    title: string;
    imageUrl: string | null;
    status: string;
    tokenSymbol: string | null;
    outcomeCount: number;
  }[];
  users: {
    address: string;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    verified: boolean;
  }[];
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ["search", debounced],
    enabled: debounced.trim().length >= 1,
    queryFn: () =>
      jsonFetch(`/api/search?q=${encodeURIComponent(debounced.trim())}`),
    staleTime: 10_000,
  });

  const hasResults =
    (data?.bets.length ?? 0) > 0 ||
    (data?.markets.length ?? 0) > 0 ||
    (data?.users.length ?? 0) > 0;

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-2 focus-within:border-primary/50 focus-within:bg-card">
          <svg
            className="h-4 w-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search markets or users…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </form>

      {open && debounced.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {!hasResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {isFetching ? "Searching…" : "No results"}
            </div>
          )}

          {(data?.users.length ?? 0) > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Users
              </div>
              {data!.users.map((u) => (
                <button
                  key={u.address}
                  onClick={() => go(`/u/${u.address}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <Avatar address={u.address} url={u.avatarUrl} size={28} />
                  <div className="min-w-0">
                    <UserNameWithBadge
                      verified={u.verified}
                      name={u.username || shortAddr(u.address)}
                      className="truncate text-sm font-medium"
                    />
                    {u.username && (
                      <div className="font-mono text-xs text-muted-foreground">
                        {shortAddr(u.address)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {(data?.markets.length ?? 0) > 0 && (
            <div className="border-t border-border p-2">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Markets
              </div>
              {data!.markets.map((m) => (
                <button
                  key={`m-${m.id}`}
                  onClick={() => go(`/markets/${m.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <BetThumbnail imageUrl={m.imageUrl} title={m.title} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {m.outcomeCount} outcomes
                    </span>
                    <StatusBadge status={m.status as BetStatusName} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {(data?.bets.length ?? 0) > 0 && (
            <div className="border-t border-border p-2">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Sidebets
              </div>
              {data!.bets.map((m) => (
                <button
                  key={`b-${m.id}`}
                  onClick={() => go(`/bets/${m.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <BetThumbnail imageUrl={m.imageUrl} title={m.title} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatToken(BigInt(m.amount), m.decimals)}{" "}
                      {m.tokenSymbol}
                    </span>
                    <StatusBadge status={m.status} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
