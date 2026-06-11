"use client";

import {
  getEmbeddedConnectedWallet,
  useCreateWallet,
  useMigrateWallets,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useRef } from "react";

import { userHasEmbeddedLinkedAccount } from "@/lib/privyWallets";

/**
 * Every authenticated user needs a Privy embedded wallet — gas sponsorship only
 * applies to embedded wallets, not MetaMask / Phantom / other external signers.
 *
 * - Migrates wallets to TEE execution (required for native gas sponsorship).
 * - Creates an embedded wallet for wallet-login users who don't have one yet.
 * - Keeps the embedded wallet active for wagmi reads and writes.
 */
export function EnsureEmbeddedWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { migrate } = useMigrateWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const migrated = useRef(false);
  const creating = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || migrated.current) return;
    migrated.current = true;
    void migrate().catch(() => {
      /* already on TEE or migration unavailable */
    });
  }, [ready, authenticated, migrate]);

  useEffect(() => {
    if (!ready || !authenticated || creating.current) return;

    const connected = getEmbeddedConnectedWallet(wallets);
    if (connected) return;
    if (user && userHasEmbeddedLinkedAccount(user)) return;

    creating.current = true;
    void createWallet()
      .catch(() => {
        /* wallet may already exist — wallets hook will catch up */
      })
      .finally(() => {
        creating.current = false;
      });
  }, [ready, authenticated, user, wallets, createWallet]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (!embedded) return;
    void setActiveWallet(embedded).catch(() => {});
  }, [ready, authenticated, wallets, setActiveWallet]);

  return null;
}
