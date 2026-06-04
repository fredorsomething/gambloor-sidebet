"use client";

import { useMemo } from "react";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";
import { formatToken } from "@/lib/utils";

type BalanceRow = {
  symbol: string;
  amount: string;
};

export function ProfileBalances({ address }: { address: string }) {
  const { balances, polRaw, isLoading, isError } =
    useWalletStableBalances(address);

  const rows = useMemo(() => {
    const out: BalanceRow[] = [];

    if (polRaw > 0n) {
      out.push({
        symbol: "POL",
        amount: formatToken(polRaw, 18, 4),
      });
    }

    for (const t of balances) {
      if (t.raw <= 0n) continue;
      out.push({
        symbol: t.symbol,
        amount: formatToken(t.raw, t.decimals, 2),
      });
    }

    return out;
  }, [balances, polRaw]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded bg-muted/60"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load Polygon balances right now.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No token balances on Polygon.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div
          key={r.symbol}
          className="flex items-center justify-between py-1.5 text-sm"
        >
          <TokenSymbol symbol={r.symbol} className="text-muted-foreground" />
          <span className="font-mono font-medium tabular-nums">{r.amount}</span>
        </div>
      ))}
    </div>
  );
}
