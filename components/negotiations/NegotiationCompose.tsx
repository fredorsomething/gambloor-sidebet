"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { stakeAmountStr } from "@/components/negotiations/NegotiationCard";
import { parseAmount } from "@/lib/utils";

export function NegotiationCompose({
  tokenSym,
  decimals,
  defaultProposerStake,
  defaultAcceptorStake,
  submitLabel = "Send offer",
  onCancel,
  onSubmit,
  pending,
}: {
  tokenSym: string;
  decimals: number;
  defaultProposerStake: string;
  defaultAcceptorStake: string;
  submitLabel?: string;
  onCancel?: () => void;
  pending?: boolean;
  onSubmit: (args: {
    proposerStake: string;
    acceptorStake: string;
    terms: string;
    message: string;
  }) => void;
}) {
  const [proposerStakeStr, setProposerStakeStr] = useState(() =>
    stakeAmountStr(defaultProposerStake, decimals),
  );
  const [acceptorStakeStr, setAcceptorStakeStr] = useState(() =>
    stakeAmountStr(defaultAcceptorStake, decimals),
  );
  const [terms, setTerms] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit() {
    try {
      const proposerStake = parseAmount(proposerStakeStr, decimals);
      const acceptorStake = parseAmount(acceptorStakeStr, decimals);
      if (proposerStake <= 0n || acceptorStake <= 0n) return;
      onSubmit({
        proposerStake: proposerStake.toString(),
        acceptorStake: acceptorStake.toString(),
        terms: terms.trim(),
        message: message.trim(),
      });
    } catch {
      /* parseAmount throws — parent should toast */
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5 block">
          <span className="label">Proposer stakes</span>
          <input
            className="input font-mono"
            inputMode="decimal"
            value={proposerStakeStr}
            onChange={(e) => setProposerStakeStr(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="label">Acceptor stakes</span>
          <input
            className="input font-mono"
            inputMode="decimal"
            value={acceptorStakeStr}
            onChange={(e) => setAcceptorStakeStr(e.target.value)}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Stakes are in {tokenSym}. Adjust either side to revise the odds.
      </p>
      <label className="space-y-1.5 block">
        <span className="label">Revised terms (optional)</span>
        <textarea
          className="textarea min-h-[72px]"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Leave blank to keep the original resolution terms."
          maxLength={10_000}
        />
      </label>
      <label className="space-y-1.5 block">
        <span className="label">Note (optional)</span>
        <input
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Short note for the other party"
          maxLength={1000}
        />
      </label>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
