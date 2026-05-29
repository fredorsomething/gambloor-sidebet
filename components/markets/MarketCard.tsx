import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { CollapsibleBlurb } from "@/components/CollapsibleBlurb";
import { ChanceGauge } from "@/components/markets/ChanceGauge";
import { Identity } from "@/components/profile/Identity";
import { TypeTag } from "@/components/ui/TypeTag";
import { MARKET_COLLATERAL_SYMBOL } from "@/lib/chains";
import type { MarketQuote, MarketRow } from "@/lib/types";

function cents(p: number | null | undefined): string | null {
  if (p == null || !Number.isFinite(p)) return null;
  return `${(p * 100).toFixed(1)}¢`;
}

export function MarketCard({ market }: { market: MarketRow }) {
  const outcomes = market.outcomes ?? [];
  const quotes = market.quotes ?? [];
  const resolved = market.status === "Resolved";
  const binary = outcomes.length === 2;

  const q = (idx: number): MarketQuote | undefined =>
    quotes.find((x) => x.index === idx);
  const q0 = q(0);
  const q1 = q(1);

  const yesProb = binary
    ? (q0?.mid ?? q0?.bestAsk ?? (q1?.mid != null ? 1 - q1.mid : null))
    : null;

  const href = `/markets/${market.id}`;

  return (
    <div className="card group relative flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <Link
        href={href}
        aria-label={market.title}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <TypeTag kind="market" />
          <span className="text-xs font-medium text-muted-foreground">
            {resolved ? "Resolved" : `${outcomes.length} outcomes`}
          </span>
        </div>

        <div className="flex gap-3 px-4 pt-3">
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
            <CollapsibleBlurb text={market.description} maxLines={2} className="mt-1" />
          </div>
        </div>

        <div className="flex min-h-[148px] flex-1 flex-col justify-end px-4 pb-3 pt-3">
          {resolved ? (
            <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-4 text-center">
              <span className="text-xs font-medium uppercase tracking-wide text-success">
                Resolved
              </span>
              <p className="mt-1 text-lg font-bold">
                {market.winningOutcome != null
                  ? outcomes[market.winningOutcome]?.label ?? "—"
                  : "—"}
              </p>
            </div>
          ) : binary ? (
            <div className="pointer-events-auto space-y-3">
              <div className="flex justify-center">
                <ChanceGauge value={yesProb} size={52} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <OutcomeButton
                  href={`${href}?o=0&side=BUY`}
                  label={outcomes[0]?.label ?? "Yes"}
                  price={cents(q0?.bestAsk)}
                  tone="yes"
                />
                <OutcomeButton
                  href={`${href}?o=1&side=BUY`}
                  label={outcomes[1]?.label ?? "No"}
                  price={cents(q1?.bestAsk)}
                  tone="no"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
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
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">Created by:</span>
            <Identity address={market.creator} size={20} link={false} />
          </span>
          <span className="shrink-0 font-medium text-muted-foreground">
            {MARKET_COLLATERAL_SYMBOL} ONLY
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
}: {
  href: string;
  label: string;
  price: string | null;
  tone: "yes" | "no";
}) {
  const toneClass =
    tone === "yes"
      ? "border-success/40 bg-success/15 text-success hover:bg-success/25"
      : "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/25";

  return (
    <Link
      href={href}
      className={`flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4 text-center font-semibold transition-colors ${toneClass}`}
    >
      <span className="text-lg leading-tight">{label}</span>
      {price && (
        <span className="font-mono text-sm font-bold opacity-90">{price}</span>
      )}
    </Link>
  );
}
