"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useConnect, type Connector } from "wagmi";

import { cn } from "@/lib/utils";

type WalletModalCtx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const Ctx = createContext<WalletModalCtx | null>(null);

export function useWalletModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWalletModal must be used within WalletModalProvider");
  return ctx;
}

function connectorIcon(c: Connector): string {
  const id = c.id.toLowerCase();
  const name = c.name.toLowerCase();
  if (c.icon) return c.icon;
  if (name.includes("coinbase")) return "🔵";
  if (name.includes("walletconnect") || id === "walletconnect") return "🔗";
  if (name.includes("metamask")) return "🦊";
  return "👛";
}

function connectorBlurb(c: Connector): string {
  const name = c.name.toLowerCase();
  if (name.includes("coinbase")) return "Coinbase Wallet & smart wallet";
  if (name.includes("walletconnect")) return "Scan with any mobile wallet";
  if (name.includes("metamask")) return "Browser extension";
  if (c.type === "injected") return "Browser extension wallet";
  return "Connect";
}

export function WalletModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { connectors, connect, isPending, variables, error, reset } =
    useConnect();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  // De-dupe connectors by name (wagmi can surface an EIP-6963 entry plus the
  // generic injected one). Prefer the named provider.
  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: Connector[] = [];
    for (const c of connectors) {
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [connectors]);

  const hasInjected =
    typeof window !== "undefined" &&
    typeof (window as { ethereum?: unknown }).ethereum !== "undefined";

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
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
            onClick={close}
          />
          <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Connect wallet</h2>
              <button
                onClick={close}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how you want to connect. We never take custody of your funds.
            </p>

            <div className="mt-5 space-y-2">
              {list.map((c) => {
                const pending =
                  isPending && (variables?.connector as Connector)?.id === c.id;
                return (
                  <button
                    key={c.uid}
                    onClick={() =>
                      connect(
                        { connector: c },
                        { onSuccess: () => close() },
                      )
                    }
                    disabled={isPending}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors",
                      "hover:border-primary/50 hover:bg-muted/50 disabled:opacity-60",
                    )}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xl">
                      {c.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.icon} alt="" className="h-6 w-6 rounded" />
                      ) : (
                        connectorIcon(c)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {connectorBlurb(c)}
                      </span>
                    </span>
                    {pending && (
                      <span className="text-xs text-muted-foreground">
                        Connecting…
                      </span>
                    )}
                  </button>
                );
              })}

              {!hasInjected && (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xl">
                    🦊
                  </span>
                  <span>
                    <span className="block font-medium">Install MetaMask</span>
                    <span className="block text-xs text-muted-foreground">
                      No browser wallet detected
                    </span>
                  </span>
                </a>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                {error.message.includes("rejected")
                  ? "Connection request was rejected."
                  : error.message}
              </div>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
