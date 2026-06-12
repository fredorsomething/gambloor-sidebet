"use client";

import { useQuery } from "@tanstack/react-query";

import { Identity } from "@/components/profile/Identity";
import { jsonFetch } from "@/lib/fetcher";
import {
  binaryOutcomeIndexTone,
  outcomeToneClass,
} from "@/lib/outcomeTone";
import { cn } from "@/lib/utils";

type Holder = {
  address: string;
  total: string;
  byOutcome: { outcomeIndex: number; shares: string }[];
};

type BookOrder = {
  id: string;
  maker: string;
  side: "BUY" | "SELL";
  outcomeIndex: number;
  price: string;
  remaining: string;
  createdAt: number;
};

type HoldersResponse = {
  holders: Holder[];
  orders: BookOrder[];
};

function microToShares(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function microToCents(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}¢`;
}

export function MarketHolders({
  marketId,
  outcomes,
  resolved,
}: {
  marketId: number;
  outcomes: { index: number; label: string }[];
  resolved: boolean;
}) {
  const query = useQuery({
    queryKey: ["market-holders", marketId],
    queryFn: () =>
      jsonFetch<HoldersResponse>(`/api/markets/${marketId}/holders`),
    refetchInterval: resolved ? false : 10_000,
  });

  const holders = query.data?.holders ?? [];
  const orders = query.data?.orders ?? [];
  const labelOf = (i: number) =>
    outcomes.find((o) => o.index === i)?.label ?? `#${i}`;
  const toneClass = (i: number) =>
    outcomeToneClass(
      binaryOutcomeIndexTone(
        outcomes.map((o) => o.label),
        i,
      ),
    );

  if (query.isLoading) return null;
  if (holders.length === 0 && orders.length === 0) return null;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section className="card p-5 space-y-3">
        <h3 className="font-semibold">Top holders</h3>
        {holders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No share holders yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {holders.map((h, rank) => (
              <li key={h.address} className="flex items-center gap-2.5">
                <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {rank + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Identity address={h.address} size={22} />
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {h.byOutcome.map((o) => (
                    <span
                      key={o.outcomeIndex}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                        toneClass(o.outcomeIndex),
                      )}
                    >
                      {microToShares(o.shares)} {labelOf(o.outcomeIndex)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <h3 className="font-semibold">Who&apos;s bidding</h3>
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No resting orders right now.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {orders.slice(0, 12).map((o) => (
              <li key={o.id} className="flex items-center gap-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <Identity address={o.maker} size={20} />
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    o.side === "BUY"
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger",
                  )}
                >
                  {o.side === "BUY" ? "Bid" : "Ask"}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    toneClass(o.outcomeIndex),
                  )}
                >
                  {labelOf(o.outcomeIndex)}
                </span>
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {microToShares(o.remaining)} @ {microToCents(o.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
