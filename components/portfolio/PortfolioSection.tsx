"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PieChart } from "lucide-react";
import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { jsonFetch } from "@/lib/fetcher";

type Position = {
  marketId: number;
  title: string;
  imageUrl: string | null;
  status: string;
  tokenSymbol: string | null;
  decimals: number;
  outcomeIndex: number;
  label: string;
  isWinner: boolean;
  shares: number;
  sharesRaw: string;
  value: number;
  avgPrice: number;
};

type SidebetExposure = {
  id: number;
  title: string;
  imageUrl: string | null;
  status: string;
  tokenSymbol: string | null;
  role: string;
  stake: number;
};

type PositionsResponse = {
  totalValue: number;
  positionsValue?: number;
  sidebetValue?: number;
  positions: Position[];
  sidebets?: SidebetExposure[];
};

export function PortfolioSection({ address }: { address: string }) {
  const { data, isLoading } = useQuery<PositionsResponse>({
    queryKey: ["portfolio", address.toLowerCase()],
    queryFn: () => jsonFetch(`/api/users/${address}/positions`),
    refetchInterval: 8_000,
  });

  const positions = data?.positions ?? [];
  const sidebets = data?.sidebets ?? [];
  const sidebetValue = data?.sidebetValue ?? 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Portfolio</h2>
        <p className="text-sm text-muted-foreground">
          Market positions and sidebet stakes you hold.
        </p>
      </div>

      <div className="card flex items-center justify-between p-5">
        <span className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Total positions value
          </span>
          {sidebetValue > 0 && (
            <span className="text-xs">
              incl. $
              {sidebetValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              committed to sidebets
            </span>
          )}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums">
          $
          {(data?.totalValue ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-muted/40" />
          ))}
        </div>
      )}

      {!isLoading && positions.length === 0 && sidebets.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">No open positions yet.</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse markets
          </Link>
        </div>
      )}

      {!isLoading && positions.length > 0 && (
        <ul className="space-y-3">
          {positions.map((p) => (
            <li key={`${p.marketId}:${p.outcomeIndex}`}>
              <Link
                href={`/markets/${p.marketId}`}
                className="card flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
              >
                <BetThumbnail
                  imageUrl={p.imageUrl}
                  title={p.title}
                  size="sm"
                  fallback
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.title}</span>
                    {p.status === "Resolved" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.isWinner
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.isWinner ? "Won" : "Resolved"}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{p.label}</span>
                    {" · "}
                    {p.shares.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    shares @ {p.avgPrice.toFixed(2)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center font-mono text-sm font-semibold tabular-nums">
                    $
                    {p.value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="flex items-center justify-end gap-0.5 text-[11px] text-muted-foreground">
                    <TokenSymbol
                      symbol={p.tokenSymbol || "USDC.e"}
                      size={10}
                    />
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && sidebets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Sidebet stakes
          </h3>
          <ul className="space-y-3">
            {sidebets.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/bets/${s.id}`}
                  className="card flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
                >
                  <BetThumbnail
                    imageUrl={s.imageUrl}
                    title={s.title}
                    size="sm"
                    fallback
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {s.status === "Open"
                          ? "Awaiting match"
                          : "Awaiting settlement"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                      Your {s.role} stake
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="inline-flex items-center gap-0.5 font-mono text-sm font-semibold tabular-nums">
                      $
                      {s.stake.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="flex items-center justify-end gap-0.5 text-[11px] text-muted-foreground">
                      <TokenSymbol symbol={s.tokenSymbol || "USDC.e"} size={10} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
