import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { ChanceGauge } from "@/components/markets/ChanceGauge";
import { Identity } from "@/components/profile/Identity";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import type { MarketQuote, MarketRow } from "@/lib/types";

function cents(p: number | null | undefined): string | null {
  if (p == null || !Number.isFinite(p)) return null;
  return `${(p * 100).toFixed(1)}¢`;
}

export function MarketCard({ market }: { market: MarketRow }) {
  const sym = market.tokenSymbol || "USDC";
  const outcomes = market.outcomes ?? [];
  const quotes = market.quotes ?? [];
  const resolved = market.status === "Resolved";
  const binary = outcomes.length === 2;

  const q = (idx: number): MarketQuote | undefined =>
    quotes.find((x) => x.index === idx);
  const q0 = q(0);
  const q1 = q(1);

  // Probability of the first ("Yes") outcome for the gauge.
  const yesProb = binary
    ? (q0?.mid ?? q0?.bestAsk ?? (q1?.mid != null ? 1 - q1.mid : null))
    : null;

  const href = `/markets/${market.id}`;

  return (
    <div className="card group relative flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      {/* Stretched link: whole card navigates to the market. */}
      <Link
        href={href}
        aria-label={market.title}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <TypeTag kind="market" />
          <span className="text-xs font-medium text-muted-foreground">
            {outcomes.length} outcomes
          </span>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <BetThumbnail
            imageUrl={market.imageUrl}
            title={market.title}
            size="md"
            fallback
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
              {market.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {market.description}
            </p>
          </div>
          {binary && (
            <ChanceGauge value={yesProb} className="mt-0.5" />
          )}
        </div>

        {/* Trade buttons */}
        {binary ? (
          <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-2">
            <OutcomeButton
              href={`${href}?o=0&side=BUY`}
              label={outcomes[0]?.label ?? "Yes"}
              price={cents(q0?.bestAsk)}
              tone="yes"
              disabled={resolved}
            />
            <OutcomeButton
              href={`${href}?o=1&side=BUY`}
              label={outcomes[1]?.label ?? "No"}
              price={cents(q1?.bestAsk)}
              tone="no"
              disabled={resolved}
            />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {outcomes.slice(0, 4).map((o) => {
              const price = cents(q(o.index)?.bestAsk ?? q(o.index)?.mid);
              return (
                <span
                  key={o.index}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {o.label}
                  {price ? ` · ${price}` : ""}
                </span>
              );
            })}
            {outcomes.length > 4 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                +{outcomes.length - 4}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <Identity address={market.creator} size={20} link={false} />
          <span className="inline-flex items-center gap-1">
            <TokenSymbol symbol={sym} size={12} /> · fee{" "}
            {(market.feeBps / 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function OutcomeButton({
  href,
  label,
  price,
  tone,
  disabled,
}: {
  href: string;
  label: string;
  price: string | null;
  tone: "yes" | "no";
  disabled?: boolean;
}) {
  const toneClass =
    tone === "yes"
      ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
      : "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/20";

  if (disabled) {
    return (
      <span className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-muted-foreground">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${toneClass}`}
    >
      <span className="truncate">{label}</span>
      {price && <span className="font-mono text-xs opacity-90">{price}</span>}
    </Link>
  );
}
