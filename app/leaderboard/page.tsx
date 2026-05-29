"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Avatar } from "@/components/profile/Identity";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";
import type { UserStats } from "@/lib/stats";

type Entry = UserStats & {
  rank: number;
  address: string;
  username: string | null;
  avatarUrl: string | null;
};

type LeaderboardResponse = { items: Entry[] };

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PODIUM_STYLE = [
  "border-gold/60 bg-gold/10 ring-gold/30",
  "border-silver/60 bg-silver/10 ring-silver/30",
  "border-bronze/60 bg-bronze/10 ring-bronze/30",
];
const PODIUM_ORDER = [1, 0, 2]; // visual: silver, gold, bronze

export default function LeaderboardPage() {
  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: () => jsonFetch(`/api/leaderboard?limit=50`),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const podium = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top sidebettors ranked by realized profit. Settle some bets for placement!
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

      {podium.length > 0 && (
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          {PODIUM_ORDER.map((idx) => {
            const e = podium[idx];
            if (!e) return <div key={idx} className="hidden sm:block" />;
            const tall = idx === 0;
            return (
              <Link
                key={e.address}
                href={`/u/${e.address}`}
                className={cn(
                  "card flex flex-col items-center p-6 text-center ring-1 transition-transform hover:-translate-y-1",
                  PODIUM_STYLE[idx],
                  tall && "sm:pb-10 sm:pt-8",
                )}
              >
                <div className="text-4xl">{MEDALS[idx]}</div>
                <Avatar
                  address={e.address}
                  url={e.avatarUrl}
                  size={tall ? 72 : 56}
                  className="mt-3 ring-2 ring-card"
                />
                <div className="mt-3 truncate font-semibold">
                  {e.username || shortAddr(e.address)}
                </div>
                <div
                  className={cn(
                    "mt-1 text-lg font-bold",
                    e.pnl >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {usd(e.pnl)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {e.wins}W · {e.losses}L · {(e.winRate * 100).toFixed(0)}%
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Bettor</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                  W / L
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
              {rest.map((e) => (
                <tr
                  key={e.address}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {e.rank}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/u/${e.address}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      <Avatar address={e.address} url={e.avatarUrl} size={28} />
                      <span className="truncate font-medium">
                        {e.username || shortAddr(e.address)}
                      </span>
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
                  <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                    {e.wins} / {e.losses}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                    {(e.winRate * 100).toFixed(0)}%
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-muted-foreground md:table-cell">
                    ${e.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
