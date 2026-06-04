"use client";

import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import { cn } from "@/lib/utils";

/** Explains that deposits must land on Polygon; Ethereum sends are not supported. */
export function PolygonFundingNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-relaxed",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TokenIcon symbol="POL" size={32} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Send funds on the Polygon network
          </p>
          <p className="text-muted-foreground">
            Copy your wallet address below and deposit only on{" "}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <TokenIcon symbol="POL" size={14} />
              Polygon
            </span>
            . Accepted tokens: <TokenSymbol symbol="USDC" size={12} />,{" "}
            <TokenSymbol symbol={MARKET_COLLATERAL_SYMBOL} size={12} />,{" "}
            <TokenSymbol symbol="pUSD" size={12} />, and{" "}
            <TokenSymbol symbol="POL" size={12} /> for gas.
          </p>
          <p className="rounded-lg border border-warning/50 bg-warning/15 px-2.5 py-2 font-medium text-warning">
            Funds sent on Ethereum may not be supported!
          </p>
        </div>
      </div>
    </div>
  );
}
