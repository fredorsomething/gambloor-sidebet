"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import {
  linkedEthereumAddresses,
  pickActiveWalletForWagmi,
} from "@/lib/privyWallets";

/**
 * Keeps wagmi's active address aligned with the Privy user's linked wallets.
 * Fixes sessions where a browser extension (MetaMask, etc.) hijacks the active
 * connector even though the user signed in with a Privy embedded wallet.
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
