"use client";

import { WalletChainBalances } from "@/components/wallet/WalletChainBalances";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";

export function ProfileBalances({ address }: { address: string }) {
  const { chainGroups, isLoading, isError } = useWalletStableBalances(address);

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

  return <WalletChainBalances chainGroups={chainGroups} />;
}
