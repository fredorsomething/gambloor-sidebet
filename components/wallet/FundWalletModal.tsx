"use client";

import { Check, Copy, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount, useBalance } from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { cn, shortAddr } from "@/lib/utils";

type FundWalletCtx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const Ctx = createContext<FundWalletCtx | null>(null);

export function useFundWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useFundWallet must be used within FundWalletProvider");
  }
  return ctx;
}

export function FundWalletProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <FundWalletModal onClose={close} />}
    </Ctx.Provider>
  );
}

function FundWalletModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const { data: balance } = useBalance({
    address,
    chainId: polygon.id,
    query: { enabled: !!address },
  });
  const [copied, setCopied] = useState(false);
  const [swapState, setSwapState] = useState<"idle" | "pending" | "error">(
    "idle",
  );
  const [swapError, setSwapError] = useState<string | null>(null);

  const onCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  // Stub: hits the placeholder endpoint. The actual USDC -> POL swap is a TODO.
  async function onSwap() {
    if (!address) return;
    setSwapState("pending");
    setSwapError(null);
    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setSwapState("error");
      setSwapError(
        body.error ?? "Auto-funding isn't available yet — deposit POL manually.",
      );
    } catch {
      setSwapState("error");
      setSwapError("Auto-funding isn't available yet — deposit POL manually.");
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
          <h2 className="text-lg font-semibold">Fund your wallet</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Placing, accepting, and settling bets are on-chain transactions on
          Polygon. They cost a small amount of <b>POL</b> for gas. Your USDC
          stake is separate.
        </p>

        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Your wallet address
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-sm">
              {address ? shortAddr(address) : "—"}
            </code>
            <button
              onClick={onCopy}
              disabled={!address}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Current balance:{" "}
            <span className="font-mono">
              {balance ? `${Number(balance.formatted).toFixed(4)} POL` : "—"}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="font-medium">Option 1 — Deposit POL</div>
            <p className="text-muted-foreground">
              Send POL on Polygon to the address above from any exchange or
              wallet. A fraction of a POL is enough for many transactions.
            </p>
          </div>

          <div>
            <div className="font-medium">Option 2 — Swap USDC for gas</div>
            <p className="text-muted-foreground">
              Send 1 USDC and we&apos;ll top up your wallet with POL for gas.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onSwap}
              disabled={!address || swapState === "pending"}
            >
              {swapState === "pending" ? "Working…" : "Swap 1 USDC → POL"}
            </Button>
            {swapState === "error" && swapError && (
              <p className="mt-2 text-xs text-muted-foreground">{swapError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Slim inline prompt shown on tx pages when the wallet has no POL for gas. */
export function LowGasBanner({ className }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const { open } = useFundWallet();
  const { data: balance } = useBalance({
    address,
    chainId: polygon.id,
    query: { enabled: !!address },
  });

  if (!isConnected || !address) return null;
  if (!balance || balance.value > 0n) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm",
        className,
      )}
    >
      <div>
        <div className="font-medium">No POL for gas</div>
        <p className="text-muted-foreground">
          On-chain actions need a little POL for gas. Fund your wallet to
          continue.
        </p>
      </div>
      <Button size="sm" onClick={open}>
        Fund wallet
      </Button>
    </div>
  );
}
