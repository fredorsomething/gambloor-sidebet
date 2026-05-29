"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { polygon, polygonAmoy } from "wagmi/chains";

import { Avatar } from "@/components/profile/Identity";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, shortAddr } from "@/lib/utils";

const CHAIN_LABEL: Record<number, string> = {
  [polygon.id]: "Polygon",
  [polygonAmoy.id]: "Amoy",
};

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { open } = useWalletModal();
  const { data: profile } = useProfile(address);

  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!isConnected || !address) {
    return (
      <button
        onClick={open}
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Connect
      </button>
    );
  }

  const wrongNetwork = chainId !== polygon.id && chainId !== polygonAmoy.id;
  const label = profile?.username || shortAddr(address);

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      {wrongNetwork && (
        <button
          onClick={() => switchChain({ chainId: polygonAmoy.id })}
          className="rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger"
        >
          Wrong network
        </button>
      )}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
      >
        <Avatar address={address} url={profile?.avatarUrl} size={28} />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2">
              <Avatar address={address} url={profile?.avatarUrl} size={36} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{label}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {shortAddr(address)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {CHAIN_LABEL[chainId] ?? `Chain ${chainId}`}
            </div>
          </div>
          <nav className="p-1 text-sm">
            <Link
              href={`/u/${address}`}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 hover:bg-muted"
            >
              My profile
            </Link>
            <Link
              href="/profile/edit"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 hover:bg-muted"
            >
              Edit profile
            </Link>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setMenuOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted"
            >
              Copy address
            </button>
            <div className="my-1 border-t border-border" />
            <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Network
            </div>
            <button
              onClick={() => switchChain({ chainId: polygonAmoy.id })}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left hover:bg-muted",
                chainId === polygonAmoy.id && "text-primary",
              )}
            >
              Polygon Amoy (testnet)
            </button>
            <button
              onClick={() => switchChain({ chainId: polygon.id })}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left hover:bg-muted",
                chainId === polygon.id && "text-primary",
              )}
            >
              Polygon mainnet
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-danger/10"
            >
              Disconnect
            </button>
          </nav>
        </div>
      )}

    </div>
  );
}
