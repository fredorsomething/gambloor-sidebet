import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { CollapsibleBlurb } from "@/components/CollapsibleBlurb";
import { OpenBetTakePanel } from "@/components/OpenBetTakePanel";
import { Identity } from "@/components/profile/Identity";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import {
  acceptorTakeEconomics,
  sidebetPoolWei,
  sidebetPayoutWei,
} from "@/lib/betEconomics";
import { resolveBetStatus } from "@/lib/betStatus";
import { binaryOutcomeIndexTone, outcomeToneClass } from "@/lib/outcomeTone";
import { cn, formatToken, fromNowUnix } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

function outcomePillClass(outcomes: string[], i: number): string {
  return outcomeToneClass(binaryOutcomeIndexTone(outcomes, i));
}

function statusLabel(bet: BetRow): React.ReactNode {
  const resolved = resolveBetStatus(bet);
  switch (resolved) {
    case "Matched":
      return <span className="text-warning">Matched</span>;
    case "Settled":
      return <span className="text-success">Settled</span>;
    case "Refunded":
      return <span className="text-muted-foreground">Refunded</span>;
    case "Cancelled":
      return <span className="text-muted-foreground">Cancelled</span>;
    case "Expired":
      return <span className="text-muted-foreground">Expired</span>;
    default:
      return <span className="text-primary">Open</span>;
  }
}

export function BetCard({
  bet,
  featured,
}: {
  bet: BetRow;
  featured?: boolean;
}) {
  const status = resolveBetStatus(bet);
  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const poolWei = sidebetPoolWei(bet);
  const payoutWei = sidebetPayoutWei(proposerStake, acceptorStake, bet.feeBps);
  const takeEconomics = acceptorTakeEconomics(
    proposerStake,
    acceptorStake,
    bet.feeBps,
  );

  const sym = bet.tokenSymbol || "tokens";
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const acceptorPick = outcomes[bet.acceptorOutcome];
  const isOpen = status === "Open";
  const reservedOpen = isOpen && !!bet.intendedAcceptor;
  const isMatched = status === "Matched";
  const isSettled = status === "Settled";
  const isRefunded = status === "Refunded";
  const winIdx = bet.winningOutcome;
  const winLabel = winIdx != null ? outcomes[winIdx] : undefined;
  const endDateSecs = bet.estimatedEndDate
    ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
    : 0;

  const card = (
    <>
      {featured && (
        <div className="featured-bet-chroma-banner">
          <span className="featured-bet-chroma-banner-text">Highest stake</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <TypeTag kind="sidebet" />
        <span className="text-xs font-medium text-muted-foreground">
          {statusLabel(bet)}
        </span>
      </div>

      <div className="flex gap-3 px-4 pt-2">
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
          <CollapsibleBlurb text={bet.description} maxLines={2} className="mt-1" />
        </div>
      </div>

      {outcomes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-4">
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

      <div className="mt-2 px-4 pb-2">
        {isOpen ? (
          <div className="space-y-2 rounded-xl bg-muted/30 p-2.5">
            {reservedOpen && (
              <p className="text-center text-[10px] font-medium text-muted-foreground">
                Reserved for a negotiated counterparty
              </p>
            )}
            <OpenBetTakePanel
              youBetWei={takeEconomics.youBetWei}
              toWinWei={takeEconomics.toWinWei}
              decimals={bet.decimals}
              symbol={sym}
              outcomeLabel={acceptorPick}
              size="sm"
            />
          </div>
        ) : isMatched ? (
          <div className="rounded-xl bg-muted/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Pool
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold">
              {formatToken(poolWei, bet.decimals)}{" "}
              <TokenSymbol symbol={sym} size={12} />
            </div>
          </div>
        ) : isSettled ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-success">
                Winner
              </div>
              {bet.winner ? (
                <div className="mt-0.5">
                  <Identity address={bet.winner} size={20} link={false} />
                </div>
              ) : winLabel ? (
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {winLabel}
                </p>
              ) : null}
            </div>
            {bet.winner ? (
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-success">
                  Won
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-lg font-bold tabular-nums text-success">
                  {formatToken(payoutWei, bet.decimals)}
                  <TokenIcon symbol={sym} size={18} />
                </div>
              </div>
            ) : null}
          </div>
        ) : isRefunded ? (
          <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Refunded — no winner backed
            {winLabel && (
              <span className="mt-1 block font-medium text-foreground">
                Declared: {winLabel}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-2.5">
        {(isMatched || isSettled || isRefunded) && bet.acceptor ? (
          <div className="flex items-center justify-between gap-3">
            <VsPlayer
              address={bet.proposer}
              stake={proposerStake}
              decimals={bet.decimals}
              symbol={sym}
            />
            <span className="shrink-0 text-xl font-bold uppercase tracking-tight text-foreground">
              VS
            </span>
            <VsPlayer
              address={bet.acceptor}
              stake={acceptorStake}
              decimals={bet.decimals}
              symbol={sym}
              align="end"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Identity address={bet.proposer} size={20} link={false} />
            <span>{isOpen ? "Open" : status}</span>
          </div>
        )}
        {endDateSecs > 0 && !isSettled && !isRefunded && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {isMatched ? "Settles" : "Ends"}{" "}
            <span className="font-medium text-foreground">
              {fromNowUnix(endDateSecs)}
            </span>
          </p>
        )}
      </div>
    </>
  );

  const linkClassName = cn(
    "card group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
    featured && "featured-bet-chroma-inner",
  );

  if (featured) {
    return (
      <div className="featured-bet-chroma">
        <Link href={`/bets/${bet.id}`} className={linkClassName}>
          {card}
        </Link>
      </div>
    );
  }

  return (
    <Link href={`/bets/${bet.id}`} className={linkClassName}>
      {card}
    </Link>
  );
}

function VsPlayer({
  address,
  stake,
  decimals,
  symbol,
  align = "start",
}: {
  address: string;
  stake: bigint;
  decimals: number;
  symbol: string;
  align?: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-1 ${
        align === "end" ? "items-end text-right" : "items-start"
      }`}
    >
      <Identity address={address} size={22} link={false} className="max-w-full" />
      <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-foreground">
        {formatToken(stake, decimals)}
        <TokenIcon symbol={symbol} size={16} />
      </span>
    </div>
  );
}
