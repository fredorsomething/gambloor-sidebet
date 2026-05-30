import { cn } from "@/lib/utils";

/** Compact fee tier label for sidebet headers. */
export function FeeBadge({
  feeBps,
  className,
}: {
  feeBps: number;
  className?: string;
}) {
  const pct = feeBps / 100;
  const label =
    pct % 1 === 0 ? `${pct.toFixed(0)}% Fee` : `${pct.toFixed(2)}% Fee`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
