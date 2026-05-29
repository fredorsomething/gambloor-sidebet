"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type OpenOrder = {
  id: string;
  outcomeIndex: number;
  label: string;
  side: "BUY" | "SELL";
  price: string; // probability decimal
  shares: string; // remaining shares decimal
  createdAt: number;
};

type TradeRow = {
  id: string;
  outcomeIndex: number;
  label: string;
  side: "BUY" | "SELL";
  shares: string;
  cost: string;
  price: string;
  createdAt: string;
};

type InventoryRow = {
  outcomeIndex: number;
  label: string;
  shares: string; // decimal
  sharesMicro: string;
  avgPrice: string; // probability decimal
};

type PortfolioResponse = {
  decimals: number;
  tokenSymbol: string | null;
  collateral: { balance: string; locked: string };
  openOrders: OpenOrder[];
  inventory: InventoryRow[];
  trades: TradeRow[];
};

function cents(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

type Tab = "positions" | "orders" | "history";

export function MarketPortfolio({
  marketId,
  account,
  onChanged,
}: {
  marketId: number;
  account?: string;
  onChanged?: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>("positions");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const query = useQuery<PortfolioResponse>({
    queryKey: ["market-portfolio", marketId, account],
    enabled: !!account,
    queryFn: () => jsonFetch(`/api/markets/${marketId}/portfolio?address=${account}`),
    refetchInterval: 6_000,
  });

  if (!account) return null;

  const data = query.data;
  const sym = data?.tokenSymbol || "USDC.e";

  async function cancelOrder(o: OpenOrder) {
    if (!account) return;
    setCancelling(o.id);
    try {
      const token = await getAccessToken();
      await jsonFetch(
        `/api/markets/${marketId}/orders/${o.id}?address=${account}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      push({ title: "Order cancelled", variant: "success" });
      query.refetch();
      onChanged?.();
    } catch (err) {
      push({
        title: "Couldn't cancel order",
        description: err instanceof Error ? err.message : undefined,
        variant: "danger",
      });
    } finally {
      setCancelling(null);
    }
  }

  const openOrders = data?.openOrders ?? [];
  const trades = data?.trades ?? [];
  const inventory = (data?.inventory ?? []).filter((i) => Number(i.shares) > 0);

  return (
    <section className="card p-5">
      <div className="mb-4 flex gap-4 border-b border-border text-sm">
        {(
          [
            ["positions", "Positions"],
            ["orders", `Open orders${openOrders.length ? ` (${openOrders.length})` : ""}`],
            ["history", "History"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-2 font-medium transition-colors",
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {tab === "positions" &&
        (inventory.length === 0 ? (
          <Empty>No position in this market yet.</Empty>
        ) : (
          <div className="space-y-2">
            {inventory.map((i) => {
              const held = Number(i.shares);
              const avg = Number(i.avgPrice);
              return (
                <div
                  key={i.outcomeIndex}
                  className="rounded-xl border border-border bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">{i.label}</span>
                    <span className="font-mono text-sm">
                      {held.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Stat label="Avg cost" value={avg > 0 ? cents(avg) : "—"} />
                    <Stat
                      label="Cost basis"
                      value={held > 0 ? `$${(held * avg).toFixed(2)}` : "—"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {tab === "orders" &&
        (openOrders.length === 0 ? (
          <Empty>No open orders.</Empty>
        ) : (
          <div className="space-y-2">
            {openOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    o.side === "BUY" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                  )}
                >
                  {o.side}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {Number(o.shares).toLocaleString(undefined, { maximumFractionDigits: 2 })} sh @{" "}
                    {cents(Number(o.price))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancelling === o.id}
                  onClick={() => cancelOrder(o)}
                >
                  {cancelling === o.id ? "Cancelling…" : "Cancel"}
                </Button>
              </div>
            ))}
          </div>
        ))}

      {tab === "history" &&
        (trades.length === 0 ? (
          <Empty>No trades yet.</Empty>
        ) : (
          <div className="space-y-1.5">
            {trades.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/30"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    t.side === "BUY" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                  )}
                >
                  {t.side}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {Number(t.shares).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  {t.label} @ {cents(Number(t.price))}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  ${Number(t.cost).toFixed(2)} {sym}
                </span>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}
