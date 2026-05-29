import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Identity } from "@/components/profile/Identity";
import { StatusBadge } from "@/components/ui/badge";
import { formatToken } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

export function BetCard({ bet }: { bet: BetRow }) {
  const stake = formatToken(BigInt(bet.amount), bet.decimals);
  const pool = formatToken(BigInt(bet.amount) * 2n, bet.decimals);
  const sym = bet.tokenSymbol || "tokens";

  return (
    <Link
      href={`/bets/${bet.id}`}
      className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={bet.status} />
        <span className="text-xs font-medium text-muted-foreground">
          fee {(bet.feeBps / 100).toFixed(1)}%
        </span>
      </div>

      <div className="mt-3 flex gap-3">
        <BetThumbnail imageUrl={bet.imageUrl} title={bet.title} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
            {bet.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {bet.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="label">Stake / side</div>
          <div className="font-mono text-lg font-bold">
            {stake} <span className="text-sm text-muted-foreground">{sym}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="label">Pool</div>
          <div className="font-mono text-sm font-semibold text-muted-foreground">
            {pool} {sym}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <Identity address={bet.proposer} size={20} link={false} />
        {bet.acceptor ? (
          <span className="text-success">matched</span>
        ) : (
          <span>open</span>
        )}
      </div>
    </Link>
  );
}
