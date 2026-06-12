"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "@/lib/viemChains";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { isAdminAddress } from "@/lib/admin";
import { externalLinkedEthereumAddress } from "@/lib/privyWallets";
import { useProfile } from "@/lib/hooks/useProfile";
import { useClickOutside } from "@/lib/useClickOutside";
import { shortAddr } from "@/lib/utils";

export function ConnectButton() {
  const { ready, authenticated, login, logout, linkWallet, user } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const { data: profile } = useProfile(address);

  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setMenuOpen(false), menuOpen);

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
  const legacyWallet = externalLinkedEthereumAddress(user);

  const onLegacyWeb3SignIn = () => {
    linkWallet({
      walletChainType: "ethereum-only",
      description:
        "Connect MetaMask or another external wallet to link your legacy Sidebet account.",
    });
    setMenuOpen(false);
  };

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
        <button
          onClick={onLegacyWeb3SignIn}
          className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted"
        >
          Legacy web3 wallet sign in
        </button>
        {legacyWallet && (
          <p className="px-3 pb-1 text-[11px] text-muted-foreground">
            Linked legacy wallet: {shortAddr(legacyWallet)}
          </p>
        )}
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
    <div className="relative flex shrink-0 items-center gap-2" ref={ref}>
      {!onPolygon && (
        <button
          onClick={() => switchChain({ chainId: polygon.id })}
          disabled={isPending}
          className="hidden rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger md:inline-flex"
        >
          {isPending ? "Switching…" : "Switch to Polygon"}
        </button>
      )}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50 md:pr-3"
        aria-label="Account menu"
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
          <div className="absolute right-0 top-full z-[120] mt-2 hidden w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 md:block">
            {menuContent}
          </div>
        </>
      )}
    </div>
  );
}
