"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { jsonFetch } from "@/lib/fetcher";
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

type LeaderboardResponse = { items: Entry[] };

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export default function LeaderboardPage() {
  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: () => jsonFetch(`/api/leaderboard?limit=50`),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top sidebettors ranked by realized profit.
        </p>
      </div>

      {isLoading && (
        <div className="card h-64 animate-pulse bg-muted/40" />
      )}

      {!isLoading && items.length === 0 && (
        <div className="card p-10 text-center text-muted-foreground">
          No settled bets yet. The throne is up for grabs.
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
                  <td className={cn("px-4 py-3 font-mono tabular-nums", rankCell)}>
                    {e.rank}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/u/${e.address}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      <Avatar address={e.address} url={e.avatarUrl} size={28} />
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
                  <td className="hidden px-4 py-3 text-right font-semibold tabular-nums sm:table-cell">
                    {e.rep}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                    {(e.winRate * 100).toFixed(0)}%
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-muted-foreground md:table-cell">
                    ${e.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
