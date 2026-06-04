"use client";

import { EthereumUsdcNotice } from "@/components/wallet/EthereumUsdcNotice";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { ETHEREUM_CHAIN_ID, ETHEREUM_USDC } from "@/lib/chains";
import type { WalletChainGroup } from "@/lib/hooks/useWalletStableBalances";
import { cn, formatToken } from "@/lib/utils";

export function WalletChainBalances({
  chainGroups,
  className,
  showBridgeNotice = true,
  onOpenDeposit,
  emptyMessage = "No token balances on Polygon or Ethereum.",
}: {
  chainGroups: WalletChainGroup[];
  className?: string;
  showBridgeNotice?: boolean;
  onOpenDeposit?: () => void;
  emptyMessage?: string;
}) {
  if (chainGroups.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    );
  }

  const ethereumUsdc = chainGroups
    .find((g) => g.chainId === ETHEREUM_CHAIN_ID)
    ?.entries.find((e) => e.symbol === ETHEREUM_USDC.symbol);

  return (
    <div className={cn("space-y-4", className)}>
      {chainGroups.map((group) => (
        <section key={group.chainId}>
          <div className="mb-1.5 flex items-center justify-between">
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-wide",
                group.onPlatform
                  ? "text-muted-foreground"
                  : "text-warning",
              )}
            >
              {group.chainLabel}
              {!group.onPlatform && (
                <span className="ml-1.5 normal-case text-[10px] font-normal">
                  (view only)
                </span>
              )}
            </span>
            {group.totalUsd > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                ≈ $
                {group.totalUsd.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            )}
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {group.entries.map((e) => (
              <div
                key={`${e.chainId}-${e.symbol}`}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <TokenSymbol
                  symbol={e.symbol}
                  className="text-muted-foreground"
                />
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    e.raw > 0n && "font-semibold text-foreground",
                  )}
                >
                  {formatToken(e.raw, e.decimals, e.symbol === "ETH" ? 4 : 2)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {showBridgeNotice && ethereumUsdc && ethereumUsdc.raw > 0n && (
        <EthereumUsdcNotice
          amountLabel={formatToken(
            ethereumUsdc.raw,
            ETHEREUM_USDC.decimals,
            2,
          )}
          onOpenDeposit={onOpenDeposit}
        />
      )}
    </div>
  );
}
