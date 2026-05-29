"use client";

import { useChainId } from "wagmi";
import type { Address } from "viem";

import { TokenSymbol } from "@/components/ui/TokenIcon";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { getTokens } from "@/lib/chains";
import { formatToken } from "@/lib/utils";

function TokenBalanceRow({
  token,
  owner,
  symbol,
}: {
  token: Address;
  owner: Address;
  symbol: string;
}) {
  const info = useTokenInfo({ token, owner });
  const decimals = info.decimals ?? 6;
  const bal = info.balance ?? 0n;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <TokenSymbol symbol={symbol} className="text-muted-foreground" />
      <span className="font-mono font-medium">
        {formatToken(bal, decimals, 2)}
      </span>
    </div>
  );
}

export function ProfileBalances({ address }: { address: string }) {
  const chainId = useChainId();
  const tokens = getTokens(chainId);

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect to Polygon to view balances.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {tokens.map((t) => (
        <TokenBalanceRow
          key={t.address}
          token={t.address as Address}
          owner={address as Address}
          symbol={t.symbol}
        />
      ))}
    </div>
  );
}
