import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { CollapsibleBlurb } from "@/components/CollapsibleBlurb";
import { Identity } from "@/components/profile/Identity";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import { formatToken, fromNowUnix } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

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
      return <span className="text-primary">Open</span>;
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
      className="card group flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <TypeTag kind="sidebet" />
        <span className="text-xs font-medium text-muted-foreground">
          {statusLabel(bet)}
        </span>
      </div>

      <div className="flex gap-3 px-4 pt-3">
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
        <div className="mt-3 flex flex-wrap gap-1.5 px-4">
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

      <div className="flex min-h-[132px] flex-1 flex-col justify-end px-4 pb-3 pt-3">
        {isOpen ? (
          <div className="space-y-2 rounded-xl bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Backing{" "}
              <span className="font-medium text-foreground">
                {proposerPick ?? "—"}
              </span>
              {" · "}
              <span className="font-mono text-foreground">
                {formatToken(proposerStake, bet.decimals)}
              </span>{" "}
              <TokenSymbol symbol={sym} size={11} />
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-card/80 px-2 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Your stake
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold">
                  {formatToken(acceptorStake, bet.decimals)}
                </div>
              </div>
              <div className="rounded-lg bg-success/10 px-2 py-2">
                <div className="text-[10px] uppercase tracking-wide text-success">
                  You win
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-success">
                  {formatToken(payoutWei, bet.decimals)}
                </div>
              </div>
            </div>
          </div>
        ) : isMatched ? (
          <div className="rounded-xl bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Pool
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold">
              {formatToken(poolWei, bet.decimals)}{" "}
              <TokenSymbol symbol={sym} size={12} />
            </div>
          </div>
        ) : isSettled ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-success">
              Winner
            </div>
            {bet.winner ? (
              <div className="mt-1">
                <Identity address={bet.winner} size={22} link={false} />
              </div>
            ) : null}
            {winLabel && (
              <p className="mt-1 text-xs text-muted-foreground">
                {winLabel} · paid {formatToken(payoutWei, bet.decimals)} {sym}
              </p>
            )}
          </div>
        ) : isRefunded ? (
          <div className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
            Refunded — no winner backed
            {winLabel && (
              <span className="mt-1 block font-medium text-foreground">
                Declared: {winLabel}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-auto border-t border-border px-4 py-3">
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
            <span>{isOpen ? "Open" : bet.status}</span>
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
