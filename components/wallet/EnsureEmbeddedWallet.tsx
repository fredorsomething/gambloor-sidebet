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

import {
  externalLinkedEthereumAddress,
  userHasEmbeddedLinkedAccount,
} from "@/lib/privyWallets";

/**
 * Email/SMS users get a Privy embedded wallet — gas sponsorship only applies there.
 * Web3 wallet sign-ins use their own wallet and pay their own POL.
 */
export function EnsureEmbeddedWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { migrate } = useMigrateWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const migrated = useRef(false);
  const creating = useRef(false);

  const web3Auth = !!externalLinkedEthereumAddress(user);

  useEffect(() => {
    if (!ready || !authenticated || migrated.current || web3Auth) return;
    migrated.current = true;
    void migrate().catch(() => {
      /* already on TEE or migration unavailable */
    });
  }, [ready, authenticated, migrate, web3Auth]);

  useEffect(() => {
    if (!ready || !authenticated || creating.current || web3Auth) return;

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
  }, [ready, authenticated, user, wallets, createWallet, web3Auth]);

  useEffect(() => {
    if (!ready || !authenticated || web3Auth) return;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (!embedded) return;
    void setActiveWallet(embedded).catch(() => {});
  }, [ready, authenticated, user, wallets, setActiveWallet, web3Auth]);

  return null;
}
