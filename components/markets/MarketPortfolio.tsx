"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useWriteContract } from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { EXCHANGE_ABI } from "@/lib/abi";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";

type OpenOrder = {
  hash: string;
  outcomeIndex: number;
  label: string;
  side: "BUY" | "SELL";
  price: string;
  makerAmount: string;
  takerAmount: string;
  filled: string;
  salt: string;
  expiry: string;
  signature: string;
  positionId: string;
  sharesRemaining: string;
  createdAt: string;
};

type TradeRow = {
  outcomeIndex: number;
  label: string;
  side: "BUY" | "SELL";
  shares: string;
  cost: string;
  counterparty: string;
  role: "taker" | "maker";
  txHash: string | null;
  createdAt: string;
};

type InventoryRow = {
  outcomeIndex: number;
  label: string;
  positionId: string;
  sharesBought: string;
  costBought: string;
  sharesSold: string;
  proceeds: string;
};

type PortfolioResponse = {
  decimals: number;
  tokenSymbol: string | null;
  openOrders: OpenOrder[];
  trades: TradeRow[];
  inventory: InventoryRow[];
};

function cents(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

type Tab = "positions" | "orders" | "history";

export function MarketPortfolio({
  marketId,
  account,
  exchange,
  positions,
  onChanged,
}: {
  marketId: number;
  account?: string;
  exchange: Address;
  /** On-chain ERC-1155 balances by outcome index (raw string), if available. */
  positions?: Record<number, string>;
  onChanged?: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const cancelTx = useWriteContract();
  const ensurePolygon = useEnsurePolygon();
  const [tab, setTab] = useState<Tab>("positions");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const query = useQuery<PortfolioResponse>({
    queryKey: ["market-portfolio", marketId, account],
    enabled: !!account,
    queryFn: () =>
      jsonFetch(`/api/markets/${marketId}/portfolio?address=${account}`),
    refetchInterval: 6_000,
  });

  if (!account) return null;

  const data = query.data;
  const decimals = data?.decimals ?? 6;
  const sym = data?.tokenSymbol || "USDC";
  const fmt = (raw: string, max = 2) =>
    Number(formatUnits(BigInt(raw || "0"), decimals)).toLocaleString(undefined, {
      maximumFractionDigits: max,
    });

  async function cancelOrder(o: OpenOrder) {
    if (!account) return;
    setCancelling(o.hash);
    try {
      await ensurePolygon();
      // Cancel on-chain so the resting signature can't be filled anymore.
      await cancelTx.writeContractAsync({
        chainId: polygon.id,
        address: exchange,
        abi: EXCHANGE_ABI,
        functionName: "cancelOrder",
        args: [
          {
            salt: BigInt(o.salt),
            maker: account as Address,
            tokenId: BigInt(o.positionId),
            makerAmount: BigInt(o.makerAmount),
            takerAmount: BigInt(o.takerAmount),
            expiration: BigInt(o.expiry),
            side: o.side === "BUY" ? 0 : 1,
          },
        ],
      });

      // Remove it from the off-chain book.
      const token = await getAccessToken();
      await jsonFetch(`/api/markets/${marketId}/orders/${o.hash}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      push({ title: "Order cancelled", variant: "success" });
      query.refetch();
      onChanged?.();
    } catch (err) {
      push({
        title: "Cancel failed",
        description: (err as Error).message,
        variant: "danger",
      });
    } finally {
      setCancelling(null);
    }
  }

  const openOrders = data?.openOrders ?? [];
  const trades = data?.trades ?? [];
  const inventory = (data?.inventory ?? []).filter(
    (i) =>
      BigInt(i.sharesBought || "0") > 0n ||
      BigInt(i.sharesSold || "0") > 0n ||
      BigInt(positions?.[i.outcomeIndex] ?? "0") > 0n,
  );

  return (
    <section className="card p-5">
      <div className="mb-4 flex gap-4 border-b border-border text-sm">
        {(
          [
            ["positions", `Inventory`],
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

      {query.isLoading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {/* Inventory / cost basis */}
      {tab === "positions" &&
        (inventory.length === 0 ? (
          <Empty>No position in this market yet.</Empty>
        ) : (
          <div className="space-y-2">
            {inventory.map((i) => {
              const bought = Number(
                formatUnits(BigInt(i.sharesBought || "0"), decimals),
              );
              const costBought = Number(
                formatUnits(BigInt(i.costBought || "0"), decimals),
              );
              const sold = Number(
                formatUnits(BigInt(i.sharesSold || "0"), decimals),
              );
              const proceeds = Number(
                formatUnits(BigInt(i.proceeds || "0"), decimals),
              );
              const avgCost = bought > 0 ? costBought / bought : 0;
              const realized = sold > 0 ? proceeds - sold * avgCost : 0;
              const held = positions?.[i.outcomeIndex]
                ? Number(formatUnits(BigInt(positions[i.outcomeIndex]), decimals))
                : bought - sold;
              return (
                <div
                  key={i.outcomeIndex}
                  className="rounded-xl border border-border bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">{i.label}</span>
                    <span className="font-mono text-sm">
                      {held.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      sh
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Stat label="Avg cost" value={avgCost > 0 ? cents(avgCost) : "—"} />
                    <Stat
                      label="Cost basis"
                      value={held > 0 ? `$${(held * avgCost).toFixed(2)}` : "—"}
                    />
                    <Stat
                      label="Bought"
                      value={`${bought.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh`}
                    />
                    <Stat
                      label="Sold"
                      value={`${sold.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh`}
                    />
                    {sold > 0 && (
                      <Stat
                        label="Realized PnL"
                        value={`${realized >= 0 ? "+" : "−"}$${Math.abs(realized).toFixed(2)}`}
                        tone={realized >= 0 ? "pos" : "neg"}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* Open orders with cancel */}
      {tab === "orders" &&
        (openOrders.length === 0 ? (
          <Empty>No open orders.</Empty>
        ) : (
          <div className="space-y-2">
            {openOrders.map((o) => (
              <div
                key={o.hash}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    o.side === "BUY"
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger",
                  )}
                >
                  {o.side}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(o.sharesRemaining)} sh @ {cents(Number(o.price))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancelling === o.hash}
                  onClick={() => cancelOrder(o)}
                >
                  {cancelling === o.hash ? "Cancelling…" : "Cancel"}
                </Button>
              </div>
            ))}
          </div>
        ))}

      {/* Trade history */}
      {tab === "history" &&
        (trades.length === 0 ? (
          <Empty>No trades yet.</Empty>
        ) : (
          <div className="space-y-1.5">
            {trades.map((t, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/30"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    t.side === "BUY"
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger",
                  )}
                >
                  {t.side}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {fmt(t.shares)} {t.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  ${fmt(t.cost)} {sym}
                </span>
                {t.txHash ? (
                  <a
                    href={`https://polygonscan.com/tx/${t.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                    title={`with ${shortAddr(t.counterparty)}`}
                  >
                    tx
                  </a>
                ) : (
                  <span className="w-4" />
                )}
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span
        className={cn(
          "font-mono font-medium text-foreground",
          tone === "pos" && "text-success",
          tone === "neg" && "text-danger",
        )}
      >
        {value}
      </span>
    </div>
  );
}
