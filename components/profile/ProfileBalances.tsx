"use client";

import { useMemo } from "react";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { EthereumUsdcNotice } from "@/components/wallet/EthereumUsdcNotice";
import { ETHEREUM_USDC } from "@/lib/chains";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";
import { formatToken } from "@/lib/utils";

type BalanceRow = {
  symbol: string;
  amount: string;
  hint?: string;
};

export function ProfileBalances({ address }: { address: string }) {
  const {
    balances,
    polRaw,
    ethereumUsdcRaw,
    isLoading,
    isError,
  } = useWalletStableBalances(address);

  const rows = useMemo(() => {
    const out: BalanceRow[] = [];

    if (polRaw > 0n) {
      out.push({
        symbol: "POL",
        amount: formatToken(polRaw, 18, 4),
        hint: "Polygon",
      });
    }

    for (const t of balances) {
      if (t.raw <= 0n) continue;
      out.push({
        symbol: t.symbol,
        amount: formatToken(t.raw, t.decimals, 2),
        hint: "Polygon",
      });
    }

    if (ethereumUsdcRaw > 0n) {
      out.push({
        symbol: "USDC",
        amount: formatToken(ethereumUsdcRaw, ETHEREUM_USDC.decimals, 2),
        hint: "Ethereum",
      });
    }

    return out;
  }, [balances, polRaw, ethereumUsdcRaw]);

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
        Could not load wallet balances right now.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No token balances on Polygon or Ethereum.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div
            key={`${r.symbol}-${r.hint}`}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <TokenSymbol symbol={r.symbol} className="text-muted-foreground" />
              {r.hint && (
                <span className="text-[10px] text-muted-foreground">{r.hint}</span>
              )}
            </span>
            <span className="font-mono font-medium tabular-nums">{r.amount}</span>
          </div>
        ))}
      </div>

      {ethereumUsdcRaw > 0n && (
        <EthereumUsdcNotice
          amountLabel={formatToken(ethereumUsdcRaw, ETHEREUM_USDC.decimals, 2)}
        />
      )}
    </div>
  );
}
