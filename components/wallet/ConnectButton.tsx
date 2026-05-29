"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";

import { Avatar } from "@/components/profile/Identity";
import { isAdminAddress } from "@/lib/admin";
import { useProfile } from "@/lib/hooks/useProfile";
import { shortAddr } from "@/lib/utils";

export function ConnectButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
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

  if (!ready) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
    );
  }

  if (!authenticated || !address) {
    return (
      <button
        onClick={login}
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Sign in
      </button>
    );
  }

  const onPolygon = chainId === polygon.id;
  const label = profile?.username || shortAddr(address);

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      {!onPolygon && (
        <button
          onClick={() => switchChain({ chainId: polygon.id })}
          disabled={isPending}
          className="rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger"
        >
          {isPending ? "Switching…" : "Switch to Polygon"}
        </button>
      )}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
      >
        <Avatar address={address} url={profile?.avatarUrl} size={28} />
        <span className="hidden max-w-[120px] truncate sm:inline">{label}</span>
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
              {onPolygon ? "Polygon mainnet" : "Wrong network — switch to Polygon"}
            </div>
          </div>
          <nav className="p-1 text-sm">
            <Link
              href={`/u/${profile?.username ?? address}`}
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
            {isAdminAddress(address) && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 font-medium text-danger hover:bg-danger/10"
              >
                Admin dashboard
              </Link>
            )}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setMenuOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted"
            >
              Copy address
            </button>
            {!onPolygon && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => switchChain({ chainId: polygon.id })}
                  className="block w-full rounded-lg px-3 py-2 text-left text-primary hover:bg-muted"
                >
                  Switch to Polygon
                </button>
              </>
            )}
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                void logout();
                setMenuOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-danger/10"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
