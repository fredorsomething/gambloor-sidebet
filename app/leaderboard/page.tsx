"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { jsonFetch } from "@/lib/fetcher";
import {
  LEADERBOARD_PERIODS,
  parseLeaderboardPeriod,
  periodDescription,
  periodEmptyMessage,
  periodLabel,
  type LeaderboardPeriod,
} from "@/lib/leaderboard";
import { cn, shortAddr } from "@/lib/utils";
import type { UserStats } from "@/lib/stats";

type Entry = UserStats & {
  rank: number;
  address: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  rep: number;
};

function rankStyles(rank: number): {
  cell: string;
  row: string;
} {
  if (rank === 1) {
    return {
      cell: "font-bold text-amber-400",
      row: "bg-amber-500/[0.07]",
    };
  }
  if (rank === 2) {
    return {
      cell: "font-bold text-slate-300",
      row: "bg-slate-400/[0.06]",
    };
  }
  if (rank === 3) {
    return {
      cell: "font-bold text-amber-800",
      row: "bg-amber-950/[0.12]",
    };
  }
  return { cell: "text-muted-foreground", row: "" };
}

type LeaderboardResponse = { items: Entry[]; period: LeaderboardPeriod };

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = parseLeaderboardPeriod(searchParams.get("period"));

  const setPeriod = useCallback(
    (next: LeaderboardPeriod) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("period");
      else params.set("period", next);
      const q = params.toString();
      router.replace(q ? `/leaderboard?${q}` : "/leaderboard", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", period],
    queryFn: () =>
      jsonFetch(`/api/leaderboard?limit=50&period=${period}`),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {periodDescription(period)}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {LEADERBOARD_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              period === p
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="card h-64 animate-pulse bg-muted/40" />
      )}

      {!isLoading && items.length === 0 && (
        <div className="card p-10 text-center text-muted-foreground">
          {periodEmptyMessage(period)}
        </div>
      )}

      {items.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Bettor</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                  Rep
                </th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                  Win %
                </th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                  Volume
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const { cell: rankCell, row: rankRow } = rankStyles(e.rank);
                return (
                  <tr
                    key={e.address}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-muted/40",
                      rankRow,
                    )}
                  >
                    <td
                      className={cn(
                        "px-4 py-3 font-mono tabular-nums",
                        rankCell,
                      )}
                    >
                      {e.rank}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/u/${e.address}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Avatar
                          address={e.address}
                          url={e.avatarUrl}
                          size={28}
                        />
                        <UserNameWithBadge
                          verified={e.verified}
                          name={
                            e.username
                              ? `@${e.username}`
                              : shortAddr(e.address)
                          }
                          className="truncate font-medium"
                        />
                      </Link>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold",
                        e.pnl >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {usd(e.pnl)}
                    </td>
                    <td
                      className={cn(
                        "hidden px-4 py-3 text-right font-semibold tabular-nums sm:table-cell",
                        e.rep > 0
                          ? "text-success"
                          : e.rep < 0
                            ? "text-danger"
                            : "text-foreground",
                      )}
                    >
                      {e.rep}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                      {(e.winRate * 100).toFixed(0)}%
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-muted-foreground md:table-cell">
                      $
                      {e.volume.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
