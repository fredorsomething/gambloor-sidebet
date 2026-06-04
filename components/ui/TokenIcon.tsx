import { cn } from "@/lib/utils";

/** Maps a token symbol to its icon asset in /public. */
const ICONS: Record<string, string> = {
  usdc: "/usdc.png",
  "usdc.e": "/usdc.png",
  pusd: "/pusd.png",
  pol: "/pol.svg",
  matic: "/pol.svg",
  eth: "/eth.png",
};

function iconFor(symbol?: string | null): string | null {
  if (!symbol) return null;
  return ICONS[symbol.trim().toLowerCase()] ?? null;
}

/** Small round currency glyph. Renders nothing for unknown symbols. */
export function TokenIcon({
  symbol,
  size = 14,
  className,
}: {
  symbol?: string | null;
  size?: number;
  className?: string;
}) {
  const src = iconFor(symbol);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("inline-block rounded-full object-contain align-text-bottom", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * A currency symbol with its icon. The icon sits just left of the symbol text,
 * e.g. "<icon> USDC", so it reads naturally to the right of any amount.
 */
export function TokenSymbol({
  symbol,
  size = 14,
  className,
  iconClassName,
}: {
  symbol?: string | null;
  size?: number;
  className?: string;
  iconClassName?: string;
}) {
  const hasIcon = !!iconFor(symbol);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      {hasIcon && <TokenIcon symbol={symbol} size={size} className={iconClassName} />}
      {symbol}
    </span>
  );
}
