"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
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

  const menuContent = (
    <>
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar address={address} url={profile?.avatarUrl} size={36} />
          <div className="min-w-0">
            <UserNameWithBadge
              verified={profile?.verified}
              name={label}
              className="text-sm font-semibold"
            />
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
          className="block rounded-lg px-3 py-2.5 hover:bg-muted"
        >
          My profile
        </Link>
        <Link
          href="/profile/edit"
          onClick={() => setMenuOpen(false)}
          className="block rounded-lg px-3 py-2.5 hover:bg-muted"
        >
          Edit profile
        </Link>
        {isAdminAddress(address) && (
          <Link
            href="/admin"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2.5 font-medium text-danger hover:bg-danger/10"
          >
            Admin dashboard
          </Link>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(address);
            setMenuOpen(false);
          }}
          className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted"
        >
          Copy address
        </button>
        {!onPolygon && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => switchChain({ chainId: polygon.id })}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-primary hover:bg-muted"
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
          className="block w-full rounded-lg px-3 py-2.5 text-left text-danger hover:bg-danger/10"
        >
          Sign out
        </button>
      </nav>
    </>
  );

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
        <UserNameWithBadge
          verified={profile?.verified}
          name={label}
          className="hidden max-w-[140px] sm:inline-flex"
        />
      </button>

      {menuOpen && (
        <>
          <MobileBottomSheet
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            title="Account"
          >
            {menuContent}
          </MobileBottomSheet>
          <div className="absolute right-0 top-full z-50 mt-2 hidden w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 md:block">
            {menuContent}
          </div>
        </>
      )}
    </div>
  );
}
