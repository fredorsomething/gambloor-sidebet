"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { polygon } from "wagmi/chains";

import { TokenIcon } from "@/components/ui/TokenIcon";
import { ERC20_ABI } from "@/lib/abi";
import { getTokens } from "@/lib/chains";
import { formatToken } from "@/lib/utils";
import { cn } from "@/lib/utils";

type TokenOption = ReturnType<typeof getTokens>[number];

type Props = {
  tokens: TokenOption[];
  value: Address | "";
  onChange: (address: Address) => void;
  className?: string;
};

/** Token picker with icons and live wallet balances. */
export function TokenSelect({ tokens, value, onChange, className }: Props) {
  const { address } = useAccount();

  const { data: balanceData } = useReadContracts({
    allowFailure: true,
    contracts: tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: polygon.id,
    })),
    query: { enabled: !!address && tokens.length > 0, refetchInterval: 12_000 },
  });

  const options = useMemo(
    () =>
      tokens.map((t, i) => ({
        ...t,
        balance: (balanceData?.[i]?.result as bigint | undefined) ?? 0n,
      })),
    [tokens, balanceData],
  );

  const selected = options.find(
    (t) => t.address.toLowerCase() === (value || "").toLowerCase(),
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <div className="pointer-events-none flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 pr-9">
          {selected ? (
            <>
              <TokenIcon symbol={selected.symbol} size={22} />
              <span className="text-sm font-medium">{selected.symbol}</span>
              <span className="truncate text-xs text-muted-foreground">
                {selected.name}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select token</span>
          )}
        </div>
        <select
          className="absolute inset-0 cursor-pointer opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value as Address)}
          aria-label="Select bet token"
        >
          {options.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol} — {t.name}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        >
          ▾
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((t) => {
          const active =
            t.address.toLowerCase() === (value || "").toLowerCase();
          return (
            <button
              key={t.address}
              type="button"
              onClick={() => onChange(t.address as Address)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
            >
              <TokenIcon symbol={t.symbol} size={16} />
              <span className="font-medium">{t.symbol}</span>
              {address && (
                <span className="font-mono text-[10px] opacity-80">
                  {formatToken(t.balance, t.decimals, 2)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Pick the stablecoin address with the highest on-wallet balance. */
export function pickDefaultTokenByBalance(
  tokens: TokenOption[],
  balances: (bigint | undefined)[],
): Address | "" {
  if (!tokens.length) return "";
  let bestIdx = 0;
  let bestBal = balances[0] ?? 0n;
  for (let i = 1; i < tokens.length; i++) {
    const bal = balances[i] ?? 0n;
    if (bal > bestBal) {
      bestBal = bal;
      bestIdx = i;
    }
  }
  return tokens[bestIdx]!.address as Address;
}
