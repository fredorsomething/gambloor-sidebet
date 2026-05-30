"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Gavel, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Identity } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import type { BetResolutionConsensus } from "@/lib/betResolution";
import { cn } from "@/lib/utils";

type Declaration = {
  id: number;
  proposedOutcome: number;
  status: string;
  note: string | null;
  proposedBy: string;
};

type ResolutionPayload = {
  proposer: Declaration | null;
  acceptor: Declaration | null;
  consensus: BetResolutionConsensus;
  agreedOutcome: number | null;
  verifiedOutcome: number | null;
};

export function BetResolutionPanel({
  betId,
  outcomes,
  proposer,
  acceptor,
  settled = false,
}: {
  betId: number;
  outcomes: string[];
  proposer: string;
  acceptor: string | null;
  settled?: boolean;
}) {
  const { address } = useAccount();
  const me = address?.toLowerCase();
  const isProposer = !!me && me === proposer.toLowerCase();
  const isAcceptor =
    !!me && !!acceptor && me === acceptor.toLowerCase();
  const isParty = isProposer || isAcceptor;

  const { data } = useQuery<ResolutionPayload>({
    queryKey: ["resolution", "bet", betId],
    queryFn: () =>
      jsonFetch(`/api/resolutions?subjectType=bet&subjectId=${betId}`),
    refetchInterval: 8_000,
    enabled: !settled && !!acceptor,
  });

  const [open, setOpen] = useState(false);

  if (settled || !acceptor) return null;

  const state = data ?? {
    proposer: null,
    acceptor: null,
    consensus: "none" as const,
    agreedOutcome: null,
    verifiedOutcome: null,
  };

  const showPanel =
    isParty ||
    state.consensus !== "none" ||
    state.proposer ||
    state.acceptor;
  if (!showPanel) return null;

  const myRole = isProposer ? "proposer" : isAcceptor ? "acceptor" : null;
  const myDecl = isProposer ? state.proposer : isAcceptor ? state.acceptor : null;
  const canDeclare =
    isParty && (state.consensus !== "unanimous" || !myDecl);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Outcome declarations</h3>
      </div>

        <p className="text-sm text-muted-foreground">
          When both sides declare the same winning outcome, the settler can
          finalize payout on-chain. If you disagree, an admin reviews before
          payout.
        </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <PartyDeclaration
          role="Proposer"
          address={proposer}
          declaration={state.proposer}
          outcomes={outcomes}
        />
        <PartyDeclaration
          role="Acceptor"
          address={acceptor}
          declaration={state.acceptor}
          outcomes={outcomes}
        />
      </div>

      {state.consensus === "unanimous" && state.agreedOutcome != null && (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p>
            <span className="font-medium text-foreground">Unanimous agreement</span>
            <span className="text-muted-foreground">
              {" "}
              — both parties declared{" "}
              <span className="font-medium text-foreground">
                {outcomes[state.agreedOutcome] ?? `Outcome ${state.agreedOutcome}`}
              </span>
              . The settler confirms payout on-chain.
            </span>
          </p>
        </div>
      )}

      {state.consensus === "disputed" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            <span className="font-medium text-warning">Disputed</span>
            <span className="text-muted-foreground">
              {" "}
              — the parties declared different outcomes. An admin must verify the
              result before settlement.
            </span>
          </p>
        </div>
      )}

      {state.verifiedOutcome != null && state.consensus === "disputed" && (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-muted-foreground">
            Admin verified:{" "}
            <span className="font-medium text-foreground">
              {outcomes[state.verifiedOutcome] ??
                `Outcome ${state.verifiedOutcome}`}
            </span>
            . The settler can finalize on-chain.
          </p>
        </div>
      )}

      {state.consensus === "partial" && (
        <p className="text-xs text-muted-foreground">
          Waiting for the other side to declare an outcome.
        </p>
      )}

      {canDeclare && (
        <>
          {myDecl && (
            <p className="text-xs text-muted-foreground">
              You declared{" "}
              <span className="font-medium text-foreground">
                {outcomes[myDecl.proposedOutcome] ??
                  `Outcome ${myDecl.proposedOutcome}`}
              </span>
              . You can update your declaration until both sides agree.
            </p>
          )}
          <Button onClick={() => setOpen(true)} className="w-full gap-2">
            <Gavel className="h-4 w-4" />
            {myDecl ? "Update my declaration" : "Declare winning outcome"}
          </Button>
        </>
      )}

      {open && myRole && (
        <DeclareModal
          betId={betId}
          outcomes={outcomes}
          initialOutcome={myDecl?.proposedOutcome ?? 0}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function PartyDeclaration({
  role,
  address,
  declaration,
  outcomes,
}: {
  role: string;
  address: string;
  declaration: Declaration | null;
  outcomes: string[];
}) {
  const label = declaration
    ? outcomes[declaration.proposedOutcome] ??
      `Outcome ${declaration.proposedOutcome}`
    : null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{role}</span>
        {declaration ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              declaration.status === "Approved"
                ? "bg-success/15 text-success"
                : declaration.status === "Rejected"
                  ? "bg-danger/15 text-danger"
                  : "bg-warning/15 text-warning",
            )}
          >
            {declaration.status}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Not declared</span>
        )}
      </div>
      <Identity address={address} size={24} showAvatar={false} link={false} />
      {label ? (
        <p className="text-sm font-semibold">{label}</p>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

function DeclareModal({
  betId,
  outcomes,
  initialOutcome,
  onClose,
}: {
  betId: number;
  outcomes: string[];
  initialOutcome: number;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const [outcome, setOutcome] = useState(initialOutcome);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!address) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const res = await jsonFetch<{
        unanimous?: boolean;
        disputed?: boolean;
      }>("/api/resolutions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          proposedBy: address,
          subjectType: "bet",
          subjectId: betId,
          proposedOutcome: outcome,
          note: note.trim() || undefined,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["resolution", "bet", betId] });
      await qc.invalidateQueries({ queryKey: ["bet", betId] });
      push({
        title: res.unanimous
          ? "Both sides agree"
          : res.disputed
            ? "Declarations recorded — disputed"
            : "Declaration saved",
        description: res.unanimous
          ? "The settler can finalize payout on-chain."
          : res.disputed
            ? "An admin will review the conflicting outcomes."
            : "Waiting for the other side to declare.",
        variant: res.disputed ? "default" : "success",
      });
      onClose();
    } catch (err) {
      push({
        title: (err as Error)?.message || "Could not save declaration",
        variant: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Declare winning outcome</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Tell the other side which outcome you believe won. Matching declarations
          let the settler confirm payout on-chain. Conflicting ones go to admin
          review.
        </p>

        <div className="mt-4 space-y-2">
          {outcomes.map((label, i) => (
            <label
              key={i}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm",
                outcome === i
                  ? "border-primary/60 bg-primary/10"
                  : "border-border",
              )}
            >
              <input
                type="radio"
                name="betResolutionOutcome"
                checked={outcome === i}
                onChange={() => setOutcome(i)}
              />
              <span className="font-medium">{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="bet-resolution-note">
            Note (optional)
          </label>
          <textarea
            id="bet-resolution-note"
            className="textarea mt-1.5 min-h-[80px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Link a source or explain your call."
            maxLength={500}
          />
        </div>

        <Button className="mt-5 w-full" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Submit declaration"}
        </Button>
      </div>
    </div>
  );
}
