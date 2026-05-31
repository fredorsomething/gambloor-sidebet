"use client";

import { User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { Identity } from "@/components/profile/Identity";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import {
  betAcceptor,
  betDetailPollInterval,
  betShowMatchup,
  betShowOpenMatchup,
  resolveBetStatus,
} from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import { cn, formatTimestamp, formatToken, fromNowUnix } from "@/lib/utils";
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
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2",
        align === "end" ? "items-end text-right" : "items-start",
      )}
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

function OpenAcceptorSide({
  outcomeLabel,
  outcomeTone: tone,
  stake,
  decimals,
  symbol,
  viewerAddress,
  isProposerView,
  intendedAcceptor,
}: {
  outcomeLabel?: string;
  outcomeTone: "success" | "danger" | "muted";
  stake: bigint;
  decimals: number;
  symbol: string;
  viewerAddress?: string;
  isProposerView: boolean;
  intendedAcceptor?: string | null;
}) {
  const viewer = viewerAddress?.toLowerCase();
  const reserved = !!intendedAcceptor;
  const intended = intendedAcceptor?.toLowerCase();
  const isIntendedViewer = !!viewer && viewer === intended;
  const showViewerPreview = !!viewer && !isProposerView && (!reserved || isIntendedViewer);
  const displayAddress = reserved
    ? intendedAcceptor
    : showViewerPreview
      ? viewerAddress
      : undefined;

  const sideLabel = isProposerView
    ? reserved
      ? "Reserved acceptor"
      : "Acceptor"
    : reserved
      ? isIntendedViewer
        ? "Your side"
        : "Reserved for"
      : "Your side";

  const helperText = isProposerView
    ? reserved
      ? "Negotiated — waiting for them to take"
      : "Open — waiting for a taker"
    : reserved
      ? isIntendedViewer
        ? "Your stake if you take this bet"
        : "Only the invited counterparty can take this side"
      : showViewerPreview
        ? "Your stake if you take this bet"
        : "Stake required to take this side";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-end gap-2 text-right">
      <span className="label">{sideLabel}</span>
      {displayAddress ? (
        <Identity address={displayAddress} size={32} weight="semibold" link={false} />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border bg-muted/20 text-muted-foreground"
          aria-hidden
        >
          <User className="h-4 w-4" strokeWidth={1.75} />
        </div>
      )}
      {outcomeLabel && (
        <OutcomeBadge label={outcomeLabel} role="acceptor" tone={tone} />
      )}
      <div className="inline-flex items-center gap-1.5 font-mono text-xl font-bold tabular-nums">
        {formatToken(stake, decimals)}
        <TokenIcon symbol={symbol} size={18} />
      </div>
      <span className="text-xs text-muted-foreground">{helperText}</span>
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
  const { address: connected } = useAccount();

  const { data } = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: (query) => {
      const d = query.state.data ?? initial;
      return betDetailPollInterval(d.bet, d.onchain);
    },
  });

  const payload = data ?? initial;
  const { bet, onchain } = payload;
  const matched = betShowMatchup(bet, onchain);
  const open = betShowOpenMatchup(bet, onchain);
  if (!matched && !open) return null;

  const acceptor = betAcceptor(bet, onchain);
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
  const isProposerView =
    !!connected && connected.toLowerCase() === bet.proposer.toLowerCase();

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
        {matched && acceptor ? (
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
        ) : (
          <OpenAcceptorSide
            outcomeLabel={acceptorPick}
            outcomeTone={outcomeTone(outcomes, bet.acceptorOutcome)}
            stake={acceptorStake}
            decimals={bet.decimals}
            symbol={symbol}
            viewerAddress={connected}
            isProposerView={isProposerView}
            intendedAcceptor={bet.intendedAcceptor}
          />
        )}
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
