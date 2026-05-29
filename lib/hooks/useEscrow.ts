"use client";

import { useMemo } from "react";
import { useChainId } from "wagmi";
import { polygon } from "wagmi/chains";

import { getEscrowAddress, getTokens, POLYGON_CHAIN_ID } from "@/lib/chains";

/** Resolves escrow + tokens on Polygon mainnet. */
export function useEscrow() {
  const chainId = useChainId();
  const onPolygon = chainId === polygon.id;
  const escrow = onPolygon ? getEscrowAddress() : undefined;
  const tokens = useMemo(() => getTokens(), []);
  return {
    chainId: POLYGON_CHAIN_ID,
    escrow,
    tokens,
    isSupported: onPolygon && !!escrow,
    onPolygon,
  };
}
