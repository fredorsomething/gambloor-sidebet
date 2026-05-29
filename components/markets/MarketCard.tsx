import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Identity } from "@/components/profile/Identity";
import type { MarketRow } from "@/lib/types";

export function MarketCard({ market }: { market: MarketRow }) {
  const sym = market.tokenSymbol || "USDC";
  const outcomes = market.outcomes ?? [];

  return (
    <Link
      href={`/markets/${market.id}`}
      className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            market.status === "Resolved"
              ? "bg-muted text-muted-foreground"
              : "bg-success/15 text-success"
          }`}
        >
          {market.status === "Resolved" ? "Resolved" : "Trading"}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {outcomes.length} outcomes
        </span>
      </div>

      <div className="mt-3 flex gap-3">
        <BetThumbnail imageUrl={market.imageUrl} title={market.title} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
            {market.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {market.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {outcomes.slice(0, 4).map((o) => (
          <span
            key={o.index}
            className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {o.label}
          </span>
        ))}
        {outcomes.length > 4 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            +{outcomes.length - 4}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <Identity address={market.creator} size={20} link={false} />
        <span>{sym} · fee {(market.feeBps / 100).toFixed(1)}%</span>
      </div>
    </Link>
  );
}
