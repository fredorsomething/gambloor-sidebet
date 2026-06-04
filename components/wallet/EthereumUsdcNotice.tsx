"use client";

import Link from "next/link";

import { TokenSymbol } from "@/components/ui/TokenIcon";
import { POLYGON_BRIDGE_URL } from "@/lib/chains";
import { cn } from "@/lib/utils";

/** Shown when the wallet holds USDC on Ethereum but Sidebet reads Polygon. */
export function EthereumUsdcNotice({
  amountLabel,
  className,
  onOpenDeposit,
}: {
  amountLabel: string;
  className?: string;
  /** Opens the in-app deposit modal (Privy cross-chain deposit). */
  onOpenDeposit?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed",
        className,
      )}
    >
      <p className="font-medium text-foreground">
        <TokenSymbol symbol="USDC" size={12} /> on Ethereum: {amountLabel}
      </p>
      <p className="mt-1 text-muted-foreground">
        Sidebet only uses Polygon. This USDC is on Ethereum — you cannot bet,
        swap, or withdraw it here until it is on Polygon (native USDC at the same
        address).
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {onOpenDeposit && (
          <button
            type="button"
            onClick={onOpenDeposit}
            className="font-medium text-primary hover:underline"
          >
            Deposit / bridge via Privy →
          </button>
        )}
        <Link
          href={POLYGON_BRIDGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Polygon bridge ↗
        </Link>
      </div>
    </div>
  );
}
