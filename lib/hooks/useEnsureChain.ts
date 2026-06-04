"use client";

import { useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet, polygon } from "wagmi/chains";

import { ETHEREUM_CHAIN_ID, POLYGON_CHAIN_ID } from "@/lib/chains";

export type SupportedWalletChainId = typeof polygon.id | typeof mainnet.id;

function toSupportedChainId(chainId: number): SupportedWalletChainId {
  if (chainId === ETHEREUM_CHAIN_ID) return mainnet.id;
  return polygon.id;
}

/**
 * Forces the active wallet onto the target chain before a write.
 * Used for Polygon app actions and Ethereum withdrawals.
 */
export function useEnsureChain(targetChainId: number) {
  const supportedChainId = toSupportedChainId(targetChainId);
  const { wallets } = useWallets();
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  return useCallback(async () => {
    const wallet =
      wallets.find(
        (w) => w.address?.toLowerCase() === address?.toLowerCase(),
      ) ?? wallets[0];
    if (wallet?.switchChain) {
      try {
        await wallet.switchChain(supportedChainId);
      } catch {
        /* fall through to wagmi */
      }
    }
    try {
      await switchChainAsync({ chainId: supportedChainId });
    } catch {
      /* already on target chain, or connector handled it above */
    }
  }, [wallets, address, switchChainAsync, supportedChainId]);
}
