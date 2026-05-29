"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Point = { t: number; pnl: number };
type PnlResponse = { points: Point[]; total: number };

const RANGES = [
  { key: "1h", label: "1H", ms: 60 * 60 * 1000 },
  { key: "1d", label: "1D", ms: 24 * 60 * 60 * 1000 },
  { key: "1w", label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "3m", label: "3M", ms: 90 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1Y", ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export function PnlChart({ address }: { address: string }) {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("1m");

  const { data, isLoading } = useQuery<PnlResponse>({
    queryKey: ["pnl", address.toLowerCase()],
    queryFn: () => jsonFetch(`/api/users/${address}/pnl`),
    staleTime: 30_000,
  });

  const range = RANGES.find((r) => r.key === rangeKey)!;

  const { windowed, change, hasData } = useMemo(() => {
    const all = data?.points ?? [];
    if (all.length === 0)
      return { windowed: [] as Point[], change: 0, hasData: false };

    const now = Date.now();
    const start = now - range.ms;
    // Baseline = cumulative PnL as of the window start.
    let baseline = 0;
    for (const p of all) {
      if (p.t <= start) baseline = p.pnl;
      else break;
    }
    const inWindow = all.filter((p) => p.t >= start);
    // Build the series within the window relative to baseline, anchored at start/end.
    const pts: Point[] = [{ t: start, pnl: baseline }];
    for (const p of inWindow) pts.push(p);
    pts.push({ t: now, pnl: inWindow.length ? inWindow[inWindow.length - 1].pnl : baseline });

    const last = pts[pts.length - 1].pnl;
    return { windowed: pts, change: last - baseline, hasData: true };
  }, [data, range.ms]);

  const path = useMemo(() => buildPath(windowed), [windowed]);

  const up = change >= 0;
  const total = data?.total ?? 0;

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">PnL</h3>
          <div
            className={cn(
              "mt-0.5 text-2xl font-bold",
              total >= 0 ? "text-success" : "text-danger",
            )}
          >
            {usd(total)}
          </div>
          <div
            className={cn(
              "text-xs",
              up ? "text-success" : "text-danger",
            )}
          >
            {usd(change)} ({range.label})
          </div>
        </div>
      </div>

      <div className="relative h-40 w-full">
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />
        ) : !hasData ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No PnL history yet.
          </div>
        ) : (
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={up ? "hsl(var(--success))" : "hsl(var(--danger))"}
                  stopOpacity="0.25"
                />
                <stop
                  offset="100%"
                  stopColor={up ? "hsl(var(--success))" : "hsl(var(--danger))"}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            {path && (
              <>
                <path
                  d={`${path.line} L 100 40 L 0 40 Z`}
                  fill="url(#pnlFill)"
                  stroke="none"
                />
                <path
                  d={path.line}
                  fill="none"
                  stroke={up ? "hsl(var(--success))" : "hsl(var(--danger))"}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>
        )}
      </div>

      <div className="mt-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            className={cn(
              "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
              r.key === rangeKey
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Map points to a 0–100 x / 0–40 y SVG polyline (y inverted, padded). */
function buildPath(points: Point[]): { line: string } | null {
  if (points.length < 2) {
    if (points.length === 1) {
      return { line: `M 0 20 L 100 20` };
    }
    return null;
  }
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.pnl);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const pad = 3;

  const coords = points.map((p) => {
    const x = ((p.t - minX) / spanX) * 100;
    const y = pad + (1 - (p.pnl - minY) / spanY) * (40 - pad * 2);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return { line: `M ${coords.join(" L ")}` };
}
