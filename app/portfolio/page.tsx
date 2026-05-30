"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight, PieChart } from "lucide-react";
import Link from "next/link";
import { useAccount } from "wagmi";

import { BetThumbnail } from "@/components/BetThumbnail";
import { ConnectButton } from "@/components/ConnectButton";
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

export default function PortfolioPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();

  const { data, isLoading } = useQuery<PositionsResponse>({
    queryKey: ["portfolio", address?.toLowerCase()],
    enabled: !!address,
    queryFn: () => jsonFetch(`/api/users/${address}/positions`),
    refetchInterval: 8_000,
  });

  if (!ready || !authenticated || !address) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to see the market positions you hold.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  const positions = data?.positions ?? [];
  const sidebets = data?.sidebets ?? [];
  const sidebetValue = data?.sidebetValue ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Market positions you currently hold.
          </p>
        </div>
        <Link
          href="/me"
          className="text-sm font-medium text-primary hover:underline"
        >
          View my sidebets →
        </Link>
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
        <div className="card p-10 text-center">
          <p className="text-muted-foreground">No open positions yet.</p>
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

      {sidebets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Sidebet stakes
            </h2>
            <Link
              href="/me"
              className="text-xs font-medium text-primary hover:underline"
            >
              Manage →
            </Link>
          </div>
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
                        {s.status === "Open" ? "Awaiting match" : "Awaiting settlement"}
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
    </div>
  );
}
