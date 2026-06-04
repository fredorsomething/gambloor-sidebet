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
      <p className="mt-2 rounded-lg border border-warning/50 bg-warning/15 px-2.5 py-2 font-medium text-warning">
        Funds sent on Ethereum may not be supported!
      </p>
      <p className="mt-2 text-muted-foreground">
        Sidebet markets use Polygon only. To use this USDC for betting, bridge to
        Polygon — or open <span className="font-medium text-foreground">Withdraw</span>{" "}
        and choose Ethereum to send it out on mainnet.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {onOpenDeposit && (
          <button
            type="button"
            onClick={onOpenDeposit}
            className="font-medium text-primary hover:underline"
          >
            Add funds →
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
