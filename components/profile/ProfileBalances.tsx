"use client";

import { useMemo } from "react";
import { useBalance, useChainId, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { polygon } from "wagmi/chains";

import { TokenSymbol } from "@/components/ui/TokenIcon";
import { ERC20_ABI } from "@/lib/abi";
import { getTokens } from "@/lib/chains";
import { formatToken } from "@/lib/utils";

type BalanceRow = {
  symbol: string;
  amount: string;
};

export function ProfileBalances({ address }: { address: string }) {
  const chainId = useChainId();
  const owner = address as Address;
  const onPolygon = chainId === polygon.id;
  const tokens = getTokens(polygon.id);

  const { data: erc20Data, isLoading: erc20Loading } = useReadContracts({
    allowFailure: true,
    contracts: tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [owner],
      chainId: polygon.id,
    })),
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: pol, isLoading: polLoading } = useBalance({
    address: owner,
    chainId: polygon.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const rows = useMemo(() => {
    const out: BalanceRow[] = [];

    const polBal = pol?.value ?? 0n;
    if (polBal > 0n) {
      out.push({
        symbol: "POL",
        amount: formatToken(polBal, 18, 4),
      });
    }

    tokens.forEach((t, i) => {
      const raw = (erc20Data?.[i]?.result as bigint | undefined) ?? 0n;
      if (raw <= 0n) return;
      out.push({
        symbol: t.symbol,
        amount: formatToken(raw, t.decimals, 2),
      });
    });

    return out;
  }, [pol?.value, tokens, erc20Data]);

  if (!onPolygon) {
    return (
      <p className="text-sm text-muted-foreground">
        Switch to Polygon to view this wallet&apos;s balances.
      </p>
    );
  }

  if (erc20Loading || polLoading) {
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
