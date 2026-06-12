"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import {
  isPrivyEmbeddedWallet,
  linkedEthereumAddresses,
  pickActiveWalletForWagmi,
} from "@/lib/privyWallets";

/**
 * Keeps wagmi's active address aligned with the Privy user's linked wallets.
 * Legacy web3 users stay on their external auth wallet; email/SMS users stay on
 * the embedded Sidebet wallet for gas sponsorship.
 */
export function EnsureLinkedActiveWallet() {
  const { authenticated, user } = usePrivy();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const syncing = useRef(false);

  useEffect(() => {
    if (!authenticated || !user || syncing.current) return;

    const linked = linkedEthereumAddresses(user);
    if (linked.size === 0) return;

    const ethereum = wallets.filter((w) => w.type === "ethereum");
    const owned = ethereum.filter((w) => linked.has(w.address.toLowerCase()));
    const external = owned.find((w) => !isPrivyEmbeddedWallet(w));
    const embedded = owned.find(isPrivyEmbeddedWallet);
    const preferred = external ?? embedded;

    if (preferred) {
      if (preferred.address.toLowerCase() !== address?.toLowerCase()) {
        syncing.current = true;
        void setActiveWallet(preferred).finally(() => {
          syncing.current = false;
        });
      }
      return;
    }

    const currentOk =
      !!address && linked.has(address.toLowerCase());
    if (currentOk) return;

    const next = pickActiveWalletForWagmi({ wallets, user });
    if (!next) return;
    if (next.address.toLowerCase() === address?.toLowerCase()) return;

    syncing.current = true;
    void setActiveWallet(next).finally(() => {
      syncing.current = false;
    });
  }, [authenticated, user, address, wallets, setActiveWallet]);

  return null;
}
