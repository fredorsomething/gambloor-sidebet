"use client";

import { useMemo } from "react";
import { useChainId } from "wagmi";

import { getEscrowAddress, getTokens, type SupportedChainId } from "@/lib/chains";

/** Resolves the escrow address + token list for the currently connected chain. */
export function useEscrow() {
  const chainId = useChainId();
  const escrow = getEscrowAddress(chainId);
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const isSupported = !!escrow;
  return {
    chainId: chainId as SupportedChainId,
    escrow,
    tokens,
    isSupported,
  };
}
