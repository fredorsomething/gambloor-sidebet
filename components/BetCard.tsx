import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Identity } from "@/components/profile/Identity";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import { formatToken, fromNowUnix } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

/** Yes/No binary bets get the conventional green/red; everything else stays neutral. */
function outcomePillClass(outcomes: string[], i: number): string {
  const isYesNo =
    outcomes.length === 2 &&
    outcomes[0]?.trim().toLowerCase() === "yes" &&
    outcomes[1]?.trim().toLowerCase() === "no";
  if (isYesNo) {
    return i === 0
      ? "bg-success/15 text-success"
      : "bg-danger/15 text-danger";
  }
  return "bg-muted text-muted-foreground";
}

function statusLabel(bet: BetRow): React.ReactNode {
  switch (bet.status) {
    case "Matched":
      return <span className="text-warning">Matched</span>;
    case "Settled":
      return <span className="text-success">Settled</span>;
    case "Refunded":
      return <span className="text-muted-foreground">Refunded</span>;
    case "Cancelled":
      return <span className="text-muted-foreground">Cancelled</span>;
    default:
      return <>fee {(bet.feeBps / 100).toFixed(1)}%</>;
  }
}

export function BetCard({ bet }: { bet: BetRow }) {
  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const poolWei = proposerStake + acceptorStake;
  const payoutWei = (poolWei * BigInt(10000 - bet.feeBps)) / 10000n;

  const sym = bet.tokenSymbol || "tokens";
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const proposerPick = outcomes[bet.proposerOutcome];
  const acceptorPick = outcomes[bet.acceptorOutcome];
  const isOpen = bet.status === "Open";
  const isMatched = bet.status === "Matched";
  const isSettled = bet.status === "Settled";
  const isRefunded = bet.status === "Refunded";
  const winIdx = bet.winningOutcome;
  const winLabel = winIdx != null ? outcomes[winIdx] : undefined;
  const endDateSecs = bet.estimatedEndDate
    ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
    : 0;

  return (
    <Link
      href={`/bets/${bet.id}`}
      className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <TypeTag kind="sidebet" />
        <span className="text-xs font-medium text-muted-foreground">
          {statusLabel(bet)}
        </span>
      </div>

      <div className="mt-3 flex gap-3">
        <BetThumbnail
          imageUrl={bet.imageUrl}
          title={bet.title}
          size="md"
          fallback
        />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
            {bet.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {bet.description}
          </p>
        </div>
      </div>

      {outcomes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {outcomes.slice(0, 4).map((o, i) => (
            <span
              key={i}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${outcomePillClass(
                outcomes,
                i,
              )}${winIdx === i ? " ring-1 ring-success/50" : ""}`}
            >
              {o}
              {winIdx === i && " ✓"}
            </span>
          ))}
          {outcomes.length > 4 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              +{outcomes.length - 4}
            </span>
          )}
        </div>
      )}

      {isOpen ? (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            Proposer backs{" "}
            <span className="font-medium text-foreground">
              {proposerPick ?? "their side"}
            </span>{" "}
            and puts up{" "}
            <span className="inline-flex items-center gap-1 font-mono text-foreground">
              {formatToken(proposerStake, bet.decimals)}
              <TokenSymbol symbol={sym} size={12} />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <div className="label">
                You stake{acceptorPick ? ` · ${acceptorPick}` : ""}
              </div>
              <div className="mt-0.5 font-mono text-base font-bold">
                {formatToken(acceptorStake, bet.decimals)}{" "}
                <TokenSymbol
                  symbol={sym}
                  size={11}
                  className="text-xs font-normal text-muted-foreground"
                />
              </div>
            </div>
            <div className="text-right">
              <div className="label">You win</div>
              <div className="mt-0.5 font-mono text-base font-bold text-success">
                {formatToken(payoutWei, bet.decimals)}{" "}
                <TokenSymbol
                  symbol={sym}
                  size={11}
                  className="text-xs font-normal text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      ) : isMatched ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="label">Total pool</div>
          <div className="mt-0.5 inline-flex items-center font-mono text-base font-bold">
            {formatToken(poolWei, bet.decimals)}{" "}
            <TokenSymbol symbol={sym} size={12} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Winner takes {formatToken(payoutWei, bet.decimals)} {sym} after fees
          </div>
        </div>
      ) : isSettled ? (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3">
          <div className="label text-success">Winner</div>
          {bet.winner ? (
            <div className="mt-1">
              <Identity address={bet.winner} size={22} link={false} />
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">—</div>
          )}
          {winLabel && (
            <div className="mt-1 text-xs text-muted-foreground">
              Outcome: <span className="font-medium text-foreground">{winLabel}</span>
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            Paid {formatToken(payoutWei, bet.decimals)} {sym}
          </div>
        </div>
      ) : isRefunded ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Both sides refunded — winning outcome was not backed by either party.
          {winLabel && (
            <span className="mt-1 block">
              Declared: <span className="font-medium text-foreground">{winLabel}</span>
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-4 space-y-2 border-t border-border pt-3">
        {(isMatched || isSettled || isRefunded) && bet.acceptor ? (
          <div className="flex items-center justify-between gap-2">
            <Identity address={bet.proposer} size={22} link={false} />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              vs
            </span>
            <Identity address={bet.acceptor} size={22} link={false} />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Identity address={bet.proposer} size={20} link={false} />
            <span>open</span>
          </div>
        )}
        {endDateSecs > 0 && !isSettled && !isRefunded && (
          <div className="text-center text-xs text-muted-foreground">
            {isMatched ? "Settles" : "Est. end"}{" "}
            <span className="font-medium text-foreground">
              {fromNowUnix(endDateSecs)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
