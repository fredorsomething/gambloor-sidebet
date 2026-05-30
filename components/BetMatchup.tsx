"use client";

import { useQuery } from "@tanstack/react-query";

import { Identity } from "@/components/profile/Identity";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { betAcceptor, betShowMatchup, resolveBetStatus } from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import { formatTimestamp, formatToken, fromNowUnix } from "@/lib/utils";
import type { GetBetResponse } from "@/lib/types";

function outcomeTone(
  outcomes: string[],
  index: number,
): "success" | "danger" | "muted" {
  const isYesNo =
    outcomes.length === 2 &&
    outcomes[0]?.trim().toLowerCase() === "yes" &&
    outcomes[1]?.trim().toLowerCase() === "no";
  if (!isYesNo) return "muted";
  return index === 0 ? "success" : "danger";
}

function OutcomeBadge({
  label,
  role,
  tone,
}: {
  label: string;
  role: string;
  tone: "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "danger"
        ? "bg-danger/15 text-danger"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
    >
      {label}
      <span className="font-normal opacity-80">· {role}</span>
    </span>
  );
}

function Side({
  role,
  address,
  outcomeLabel,
  outcomeTone: tone,
  stake,
  decimals,
  symbol,
  align,
}: {
  role: string;
  address: string;
  outcomeLabel?: string;
  outcomeTone: "success" | "danger" | "muted";
  stake: bigint;
  decimals: number;
  symbol: string;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-2 ${
        align === "end" ? "items-end text-right" : "items-start"
      }`}
    >
      <span className="label">{role}</span>
      <Identity address={address} size={32} weight="semibold" link={false} />
      {outcomeLabel && (
        <OutcomeBadge label={outcomeLabel} role={role.toLowerCase()} tone={tone} />
      )}
      <div className="inline-flex items-center gap-1.5 font-mono text-xl font-bold tabular-nums">
        {formatToken(stake, decimals)}
        <TokenIcon symbol={symbol} size={18} />
      </div>
    </div>
  );
}

export function BetMatchup({
  id,
  initial,
}: {
  id: number;
  initial: GetBetResponse;
}) {
  const { data } = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: 3_000,
  });

  const payload = data ?? initial;
  const { bet, onchain } = payload;
  if (!betShowMatchup(bet, onchain)) return null;

  const acceptor = betAcceptor(bet, onchain);
  if (!acceptor) return null;

  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const poolWei = proposerStake + acceptorStake;
  const symbol = bet.tokenSymbol || "tokens";
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const proposerPick = outcomes[bet.proposerOutcome];
  const acceptorPick = outcomes[bet.acceptorOutcome];
  const endDateSecs = bet.estimatedEndDate
    ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
    : 0;
  const status = resolveBetStatus(bet, onchain);
  const settled = status === "Settled" || status === "Refunded";

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-3">
        <h2 className="text-sm font-semibold">The bet</h2>
        <div className="text-xs text-muted-foreground">
          Pool{" "}
          <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-foreground">
            {formatToken(poolWei, bet.decimals)}
            <TokenSymbol symbol={symbol} size={12} />
          </span>
          <span className="mx-1.5 text-border">·</span>
          Settler fee {(bet.feeBps / 100).toFixed(2)}%
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-6 px-5 py-5 sm:flex-row sm:items-center">
        <Side
          role="Proposer"
          address={bet.proposer}
          outcomeLabel={proposerPick}
          outcomeTone={outcomeTone(outcomes, bet.proposerOutcome)}
          stake={proposerStake}
          decimals={bet.decimals}
          symbol={symbol}
          align="start"
        />
        <div className="flex shrink-0 items-center justify-center sm:px-2">
          <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            vs
          </span>
        </div>
        <Side
          role="Acceptor"
          address={acceptor}
          outcomeLabel={acceptorPick}
          outcomeTone={outcomeTone(outcomes, bet.acceptorOutcome)}
          stake={acceptorStake}
          decimals={bet.decimals}
          symbol={symbol}
          align="end"
        />
      </div>

      {endDateSecs > 0 && !settled && (
        <div className="border-t border-border bg-muted/10 px-5 py-4 text-center">
          <span className="text-xs text-muted-foreground">
            {status === "Matched" ? "Time until settlement" : "Estimated end"}
          </span>
          <div className="mt-1 text-lg font-semibold">{fromNowUnix(endDateSecs)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatTimestamp(endDateSecs)}
          </div>
        </div>
      )}
    </section>
  );
}
