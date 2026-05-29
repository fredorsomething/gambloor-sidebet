import { cn } from "@/lib/utils";

/**
 * Compact circular "chance" gauge, e.g. a 2% probability donut. `value` is a
 * probability in 0–1. Colour shifts green/red around the 50% line.
 */
export function ChanceGauge({
  value,
  label = "chance",
  size = 56,
  className,
}: {
  value: number | null;
  label?: string;
  size?: number;
  className?: string;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const dash = c * pct;

  const color =
    value == null
      ? "hsl(var(--muted-foreground))"
      : pct >= 0.5
        ? "hsl(var(--success))"
        : pct >= 0.2
          ? "hsl(var(--warning))"
          : "hsl(var(--danger))";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-sm font-bold">
          {value == null ? "—" : `${Math.round(pct * 100)}%`}
        </span>
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
