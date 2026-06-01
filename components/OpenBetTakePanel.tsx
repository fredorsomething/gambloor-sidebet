import { TokenIcon } from "@/components/ui/TokenIcon";
import { outcomeLabelTone, outcomeToneClass } from "@/lib/outcomeTone";
import { cn, formatToken } from "@/lib/utils";

type Props = {
  youBetWei: bigint;
  toWinWei: bigint;
  decimals: number;
  symbol: string;
  /** Acceptor-side outcome label, e.g. Yes / No / Up / Down. */
  outcomeLabel?: string;
  size?: "sm" | "md";
  className?: string;
};

export function OpenBetTakePanel({
  youBetWei,
  toWinWei,
  decimals,
  symbol,
  outcomeLabel,
  size = "md",
  className,
}: Props) {
  const amountClass =
    size === "sm"
      ? "text-sm font-bold"
      : "text-base font-bold sm:text-lg";
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <div className={cn("space-y-2", className)}>
      {outcomeLabel && (
        <div className="flex justify-center">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              outcomeToneClass(outcomeLabelTone(outcomeLabel)),
            )}
          >
            Take {outcomeLabel}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card/80 px-3 py-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            You bet
          </div>
          <div
            className={cn(
              "mt-1 inline-flex items-center justify-center gap-1 font-mono tabular-nums text-foreground",
              amountClass,
            )}
          >
            {formatToken(youBetWei, decimals)}
            <TokenIcon symbol={symbol} size={iconSize} />
          </div>
        </div>
        <div className="rounded-xl border border-success/35 bg-success/10 px-3 py-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-success">
            To win
          </div>
          <div
            className={cn(
              "mt-1 inline-flex items-center justify-center gap-1 font-mono tabular-nums text-success",
              amountClass,
            )}
          >
            {formatToken(toWinWei, decimals)}
            <TokenIcon symbol={symbol} size={iconSize} />
          </div>
        </div>
      </div>
    </div>
  );
}
