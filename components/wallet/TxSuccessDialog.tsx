"use client";

import { CheckCircle2, ExternalLink, X } from "lucide-react";
import type { Hex } from "viem";

import { Button } from "@/components/ui/button";
import { explorerLabel, explorerTx } from "@/lib/chains";

export function TxSuccessDialog({
  title,
  description,
  txHash,
  chainId,
  onClose,
}: {
  title: string;
  description?: string;
  txHash: Hex;
  chainId: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm card p-6 shadow-xl animate-in fade-in zoom-in-95"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-success-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
          <h2 id="tx-success-title" className="mt-4 text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          )}
          <a
            href={explorerTx(chainId, txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View on {explorerLabel(chainId)}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button className="mt-5 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
