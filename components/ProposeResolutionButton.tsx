"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Proposal = {
  id: number;
  proposedOutcome: number;
  status: "Pending" | "Approved" | "Rejected";
  note: string | null;
  proposedBy: string;
};

export function ProposeResolutionButton({
  subjectType,
  subjectId,
  outcomes,
  participants,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  outcomes: string[];
  /** Addresses allowed to propose (proposer/acceptor/settler or creator/settler). */
  participants: string[];
}) {
  const { address } = useAccount();
  const eligible =
    !!address &&
    participants.some((p) => p.toLowerCase() === address.toLowerCase());

  const { data } = useQuery<{ proposal: Proposal | null }>({
    queryKey: ["resolution", subjectType, subjectId],
    queryFn: () =>
      jsonFetch(
        `/api/resolutions?subjectType=${subjectType}&subjectId=${subjectId}`,
      ),
    refetchInterval: 20_000,
  });

  const proposal = data?.proposal ?? null;
  const [open, setOpen] = useState(false);

  // Nothing to show to non-participants unless a proposal exists.
  if (!eligible && !proposal) return null;

  const showButton =
    eligible && (!proposal || proposal.status === "Rejected");

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Resolution</h3>
      </div>

      {proposal?.status === "Pending" && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-warning">Under review</p>
          <p className="mt-0.5 text-muted-foreground">
            Proposed outcome:{" "}
            <span className="font-medium text-foreground">
              {outcomes[proposal.proposedOutcome] ??
                `Outcome ${proposal.proposedOutcome}`}
            </span>
            . An admin/verifier is reviewing it.
          </p>
        </div>
      )}

      {proposal?.status === "Approved" && (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-muted-foreground">
            Verified outcome:{" "}
            <span className="font-medium text-foreground">
              {outcomes[proposal.proposedOutcome] ??
                `Outcome ${proposal.proposedOutcome}`}
            </span>
            . The settler will finalize it on-chain.
          </p>
        </div>
      )}

      {proposal?.status === "Rejected" && eligible && (
        <p className="text-xs text-muted-foreground">
          A previous proposal was rejected. You can submit a new one.
        </p>
      )}

      {showButton && (
        <>
          <p className="text-sm text-muted-foreground">
            Think this is ready to settle? Propose the winning outcome and send
            it to a verifier for review.
          </p>
          <Button onClick={() => setOpen(true)} className="w-full gap-2">
            <Gavel className="h-4 w-4" />
            Propose resolution
          </Button>
        </>
      )}

      {open && (
        <ProposeModal
          subjectType={subjectType}
          subjectId={subjectId}
          outcomes={outcomes}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function ProposeModal({
  subjectType,
  subjectId,
  outcomes,
  onClose,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  outcomes: string[];
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const [outcome, setOutcome] = useState(0);
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
      await jsonFetch("/api/resolutions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          proposedBy: address,
          subjectType,
          subjectId,
          proposedOutcome: outcome,
          note: note.trim() || undefined,
        }),
      });
      await qc.invalidateQueries({
        queryKey: ["resolution", subjectType, subjectId],
      });
      push({
        title: "Resolution proposed",
        description: "Sent to a verifier for review.",
        variant: "success",
      });
      onClose();
    } catch (err) {
      push({
        title: (err as Error)?.message || "Could not propose resolution",
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
          <h2 className="text-lg font-semibold">Propose resolution</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Select the outcome you believe won. A verifier will review your
          evidence before the result is finalized.
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
                name="resolutionOutcome"
                checked={outcome === i}
                onChange={() => setOutcome(i)}
              />
              <span className="font-medium">{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="resolution-note">
            Evidence / note (optional)
          </label>
          <textarea
            id="resolution-note"
            className="textarea mt-1.5 min-h-[80px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Link a source or explain how this outcome resolved."
            maxLength={500}
          />
        </div>

        <Button className="mt-5 w-full" onClick={submit} disabled={saving}>
          {saving ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
