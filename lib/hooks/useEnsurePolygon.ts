"use client";

import { useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";

/**
 * Returns a function that forces the active wallet onto Polygon before a write.
 *
 * Privy embedded wallets can default to Ethereum mainnet even though our app
 * only targets Polygon. Sending a tx in that state submits to the wrong chain
 * (e.g. calling the Polygon USDC address on Ethereum), which fails with an
 * opaque "Unexpected error". Calling this before each on-chain action switches
 * the embedded wallet (and wagmi's state) to Polygon (chain 137 / POL gas).
 */
export function useEnsurePolygon() {
  const { wallets } = useWallets();
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  return useCallback(async () => {
    // Switch the Privy wallet itself first (authoritative for embedded wallets).
    const wallet =
      wallets.find(
        (w) => w.address?.toLowerCase() === address?.toLowerCase(),
      ) ?? wallets[0];
    if (wallet?.switchChain) {
      try {
        await wallet.switchChain(polygon.id);
      } catch {
        /* fall through to wagmi */
      }
    }
    // Sync wagmi connection state to Polygon.
    try {
      await switchChainAsync({ chainId: polygon.id });
    } catch {
      /* already on Polygon, or connector handled it above */
    }
  }, [wallets, address, switchChainAsync]);
}
