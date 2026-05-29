"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";

type DirectoryUser = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string;
  verified: boolean;
  rep: number;
  pnl: number;
};

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function groupKey(u: DirectoryUser): string {
  const first = (u.username ?? "")[0]?.toUpperCase() ?? "";
  if (first >= "A" && first <= "Z") return first;
  if (!u.username) return "0x";
  return "#";
}

export default function UsersDirectoryPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery<{ users: DirectoryUser[] }>({
    queryKey: ["directory"],
    queryFn: () => jsonFetch("/api/users"),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const all = data?.users ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (u) =>
        u.username?.toLowerCase().includes(term) ||
        u.address.toLowerCase().includes(term) ||
        u.bio?.toLowerCase().includes(term),
    );
  }, [data, q]);

  const groups = useMemo(() => {
    const map = new Map<string, DirectoryUser[]>();
    for (const u of filtered) {
      const k = groupKey(u);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(u);
    }
    // Order: A-Z, then #, then 0x (unnamed wallets).
    const order = (k: string) =>
      k === "0x" ? 2 : k === "#" ? 1 : 0;
    return Array.from(map.entries()).sort((a, b) => {
      const o = order(a[0]) - order(b[0]);
      return o !== 0 ? o : a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Directory</h1>
        <p className="text-sm text-muted-foreground">
          Active users on sidebet, A to Z.
        </p>
      </div>

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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, address, or bio…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {isLoading ? (
        <div className="card h-40 animate-pulse rounded-2xl bg-muted/40" />
      ) : groups.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted-foreground">
          No users found.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([letter, users]) => (
            <section key={letter} className="space-y-2">
              <h2 className="sticky top-0 z-10 bg-background/80 py-1 text-sm font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {letter === "0x" ? "Unnamed wallets" : letter}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {users.map((u) => (
                  <Link
                    key={u.address}
                    href={`/u/${u.address}`}
                    className="card flex items-center gap-3 p-3 transition-colors hover:border-primary/40"
                  >
                    <Avatar address={u.address} url={u.avatarUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <UserNameWithBadge
                        verified={u.verified}
                        name={
                          u.username
                            ? `@${u.username}`
                            : shortAddr(u.address)
                        }
                        className="truncate text-sm font-semibold"
                      />
                      {u.bio ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {u.bio}
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-muted-foreground">
                          {shortAddr(u.address)}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          Rep{" "}
                          <span className="font-semibold text-foreground">
                            {u.rep}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          PnL{" "}
                          <span
                            className={cn(
                              "font-semibold",
                              u.pnl >= 0 ? "text-success" : "text-danger",
                            )}
                          >
                            {usd(u.pnl)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
