"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  History,
  PlusCircle,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TokenSymbol } from "@/components/ui/TokenIcon";
import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type ActivityKind =
  | "market_buy"
  | "market_sell"
  | "bet_created"
  | "bet_joined"
  | "bet_won"
  | "bet_lost"
  | "bet_push"
  | "bet_refunded"
  | "bet_cancelled";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  link: string;
  tokenSymbol: string | null;
  amount: number | null;
  delta: number | null;
  detail: string | null;
};

const FILTERS: { id: string; label: string; kinds: ActivityKind[] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "buys", label: "Buys", kinds: ["market_buy"] },
  { id: "sells", label: "Sells", kinds: ["market_sell"] },
  { id: "created", label: "Created", kinds: ["bet_created"] },
  { id: "joined", label: "Joined", kinds: ["bet_joined"] },
  { id: "won", label: "Won", kinds: ["bet_won"] },
  { id: "lost", label: "Lost", kinds: ["bet_lost"] },
  {
    id: "closed",
    label: "Refunded / Cancelled",
    kinds: ["bet_refunded", "bet_cancelled", "bet_push"],
  },
];

const KIND_META: Record<
  ActivityKind,
  { label: string; icon: typeof History; tone: string }
> = {
  market_buy: { label: "Buy", icon: ArrowDownLeft, tone: "text-success" },
  market_sell: { label: "Sell", icon: ArrowUpRight, tone: "text-danger" },
  bet_created: { label: "Created", icon: PlusCircle, tone: "text-primary" },
  bet_joined: { label: "Joined", icon: PlusCircle, tone: "text-primary" },
  bet_won: { label: "Won", icon: Trophy, tone: "text-success" },
  bet_lost: { label: "Lost", icon: XCircle, tone: "text-danger" },
  bet_push: { label: "Push", icon: History, tone: "text-muted-foreground" },
  bet_refunded: {
    label: "Refunded",
    icon: History,
    tone: "text-muted-foreground",
  },
  bet_cancelled: {
    label: "Cancelled",
    icon: XCircle,
    tone: "text-muted-foreground",
  },
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function amountLabel(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function deltaLabel(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export function ProfileActivity({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ["activity", address.toLowerCase()],
    enabled: open,
    queryFn: () => jsonFetch(`/api/users/${address}/activity`),
    staleTime: 15_000,
  });

  const all = useMemo(() => data?.activity ?? [], [data]);
  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || f.kinds.length === 0) return all;
    return all.filter((a) => f.kinds.includes(a.kind));
  }, [all, filter]);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-lg font-semibold">Activity</span>
          <span className="text-sm font-normal text-muted-foreground">
            Full trading history
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="flex flex-wrap gap-1.5 p-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="max-h-[480px] overflow-y-auto px-3 pb-3">
            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-muted/50"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No activity to show.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {filtered.map((a) => (
                  <ActivityRow key={a.id} item={a} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const isTrade = item.kind === "market_buy" || item.kind === "market_sell";

  return (
    <li>
      <Link
        href={item.link}
        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
            meta.tone,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {item.detail ?? meta.label} · {timeLabel(item.at)}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {item.amount != null && (
            <span className="flex items-center justify-end gap-1 text-sm font-medium tabular-nums">
              {amountLabel(item.amount)}
              {isTrade ? (
                <span className="font-normal text-muted-foreground">
                  shares
                </span>
              ) : (
                item.tokenSymbol && (
                  <TokenSymbol
                    symbol={item.tokenSymbol}
                    size={12}
                    className="font-normal text-muted-foreground"
                  />
                )
              )}
            </span>
          )}
          {item.delta != null && item.delta !== 0 && (
            <span
              className={cn(
                "flex items-center justify-end gap-1 text-xs font-semibold tabular-nums",
                item.delta > 0 ? "text-success" : "text-danger",
              )}
            >
              {deltaLabel(item.delta)}
              {item.tokenSymbol && (
                <TokenSymbol
                  symbol={item.tokenSymbol}
                  size={10}
                  className="font-normal opacity-80"
                />
              )}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
