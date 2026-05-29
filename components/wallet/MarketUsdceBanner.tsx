"use client";

import Link from "next/link";
import { ArrowDownUp } from "lucide-react";
import { parseUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { ERC20_ABI } from "@/lib/abi";
import {
  getMarketCollateralToken,
  getTokenBySymbol,
  MARKET_COLLATERAL_SYMBOL,
} from "@/lib/chains";
import { cn, formatToken } from "@/lib/utils";

/**
 * Shown on market pages when the wallet holds native USDC but little/no USDC.e
 * (CLOB collateral). Privy card deposits land as native USDC.
 */
export function MarketUsdceBanner({ className }: { className?: string }) {
  const { address } = useAccount();
  const marketToken = getMarketCollateralToken();
  const nativeUsdc = getTokenBySymbol(polygon.id, "USDC")!;

  const enabled = !!address;

  const { data } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? [
          {
            address: nativeUsdc.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address as Address],
            chainId: polygon.id,
          },
          {
            address: marketToken.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address as Address],
            chainId: polygon.id,
          },
        ]
      : [],
    query: { enabled, refetchInterval: 12_000 },
  });

  if (!enabled) return null;

  const nativeRaw = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const usdceRaw = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const d = marketToken.decimals;

  // One full set / typical trade is 1 unit; surface mismatch above dust.
  const minNative = parseUnits("0.5", d as number);
  if (nativeRaw < minNative) return null;
  if (usdceRaw >= nativeRaw) return null;

  const nativeLabel = formatToken(nativeRaw, d);
  const usdceLabel = formatToken(usdceRaw, d);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm",
        className,
      )}
    >
      <div className="space-y-1">
        <div className="font-medium">
          Markets use <TokenSymbol symbol={MARKET_COLLATERAL_SYMBOL} />, not
          native USDC
        </div>
        <p className="text-muted-foreground">
          You have {nativeLabel} USDC (native) and {usdceLabel}{" "}
          {MARKET_COLLATERAL_SYMBOL} for trading. Card deposits via Privy arrive
          as native USDC — swap to {MARKET_COLLATERAL_SYMBOL} before minting or
          buying shares.
        </p>
      </div>
      <Button size="sm" variant="secondary" asChild>
        <Link href="/swap?sell=USDC&buy=USDC.e" className="inline-flex gap-1.5">
          <ArrowDownUp className="h-3.5 w-3.5" />
          Swap to {MARKET_COLLATERAL_SYMBOL}
        </Link>
      </Button>
    </div>
  );
}
