"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { Identity } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import type { NegotiationPayload, NegotiationStatus } from "@/lib/negotiations";
import { formatToken } from "@/lib/utils";

export function NegotiationCard({
  n,
  betTitle,
  betId,
  decimals,
  tokenSym,
  viewerAddress,
  betProposer,
  betStatus,
  onAccept,
  onDecline,
  onWithdraw,
  onLockInEscrow,
  onCounter,
  busy,
  compact,
  escrowRevisionNeeded,
  intendedAcceptor,
}: {
  n: NegotiationPayload;
  betTitle: string;
  betId: number;
  decimals: number;
  tokenSym: string;
  viewerAddress?: string;
  betProposer: string;
  betStatus: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
  onLockInEscrow?: () => void;
  onCounter?: () => void;
  busy?: boolean;
  compact?: boolean;
  escrowRevisionNeeded?: boolean;
  intendedAcceptor?: string | null;
}) {
  const me = viewerAddress?.toLowerCase();
  const isProposer = !!me && me === betProposer.toLowerCase();
  const isSender = !!me && me === n.fromAddress.toLowerCase();
  const isRecipient = !!me && me === n.toAddress.toLowerCase();
  const isIntendedAcceptor =
    !!me &&
    !!intendedAcceptor &&
    me === intendedAcceptor.toLowerCase() &&
    n.status === "Accepted";

  const proposerStake = useMemo(() => BigInt(n.proposerStake), [n.proposerStake]);
  const acceptorStake = useMemo(() => BigInt(n.acceptorStake), [n.acceptorStake]);

  const statusTone: Record<NegotiationStatus, string> = {
    Pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    Accepted: "bg-success/15 text-success",
    Declined: "bg-danger/15 text-danger",
    Withdrawn: "bg-muted text-muted-foreground",
  };

  return (
    <div
      className={
        compact
          ? "w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-sm"
          : "rounded-xl border border-border p-4 space-y-3"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Counter-offer
          </div>
          <Link
            href={`/bets/${betId}`}
            className="mt-0.5 block truncate text-sm font-semibold hover:text-primary"
          >
            {betTitle}
          </Link>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[n.status]}`}
        >
          {n.status}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>From</span>
        <Identity address={n.fromAddress} size={20} />
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
        <div>
          <div className="label">Proposer stakes</div>
          <div className="mt-0.5 inline-flex items-center font-mono font-semibold">
            {formatToken(proposerStake, decimals)}
            <TokenSymbol
              symbol={tokenSym}
              size={11}
              className="ml-1 text-xs font-normal text-muted-foreground"
            />
          </div>
        </div>
        <div>
          <div className="label">Acceptor stakes</div>
          <div className="mt-0.5 inline-flex items-center font-mono font-semibold">
            {formatToken(acceptorStake, decimals)}
            <TokenSymbol
              symbol={tokenSym}
              size={11}
              className="ml-1 text-xs font-normal text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {n.terms && (
        <div>
          <div className="label">Revised terms</div>
          <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-sm text-foreground/90">
            {n.terms}
          </p>
        </div>
      )}
      {n.message && (
        <p className="text-sm text-muted-foreground">“{n.message}”</p>
      )}

      {n.status === "Pending" && betStatus === "Open" && (
        <div className="flex flex-wrap justify-end gap-2">
          {isRecipient && onDecline && onAccept && (
            <>
              <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
                Decline
              </Button>
              <Button size="sm" onClick={onAccept} disabled={busy}>
                Accept terms
              </Button>
            </>
          )}
          {isSender && onWithdraw && (
            <Button variant="ghost" size="sm" onClick={onWithdraw} disabled={busy}>
              Withdraw
            </Button>
          )}
        </div>
      )}

      {n.status === "Accepted" &&
        isProposer &&
        betStatus === "Open" &&
        escrowRevisionNeeded &&
        onLockInEscrow && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
            <p className="text-muted-foreground">
              Terms are locked in on this sidebet. Publish the updated on-chain
              offer (same listing — no duplicate).
            </p>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={onLockInEscrow}>
                Publish on-chain offer
              </Button>
            </div>
          </div>
        )}

      {n.status === "Accepted" &&
        isProposer &&
        betStatus === "Open" &&
        !escrowRevisionNeeded && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-muted-foreground">
            <p>Locked-in terms are live on-chain for this sidebet.</p>
          </div>
        )}

      {n.status === "Accepted" && isIntendedAcceptor && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-muted-foreground">
          <p>
            {escrowRevisionNeeded
              ? "Your terms were accepted and locked in. Waiting for the proposer to publish the updated on-chain offer."
              : "Your terms were accepted. Take the bet below."}
          </p>
          <Link
            href={`/bets/${betId}`}
            className="mt-2 inline-block font-medium text-primary hover:underline"
          >
            Open sidebet →
          </Link>
        </div>
      )}

      {n.status === "Accepted" &&
        !isProposer &&
        !isIntendedAcceptor &&
        isSender && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-muted-foreground">
            <p>Your terms were accepted on this sidebet.</p>
            <Link
              href={`/bets/${betId}`}
              className="mt-2 inline-block font-medium text-primary hover:underline"
            >
              View sidebet →
            </Link>
          </div>
        )}

      {n.status === "Pending" && isRecipient && onCounter && betStatus === "Open" && (
        <div className="border-t border-border pt-2">
          <Button variant="outline" size="sm" onClick={onCounter} disabled={busy}>
            Send counter-offer
          </Button>
        </div>
      )}
    </div>
  );
}

/** Format wei to human amount string for form defaults. */
export function stakeAmountStr(wei: string, decimals: number): string {
  try {
    return formatUnits(BigInt(wei), decimals);
  } catch {
    return "0";
  }
}
