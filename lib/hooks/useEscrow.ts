"use client";

import { useMemo } from "react";
import { useChainId } from "wagmi";
import { polygon } from "@/lib/viemChains";

import {
  getEscrowAddress,
  getEscrowV2Address,
  getEscrowV3Address,
  getTokens,
  POLYGON_CHAIN_ID,
} from "@/lib/chains";

/** Resolves the active escrow + tokens on Polygon mainnet. */
export function useEscrow() {
  const chainId = useChainId();
  const onPolygon = chainId === polygon.id;
  const escrowV3 = onPolygon ? getEscrowV3Address() : undefined;
  const escrowV2 = onPolygon ? getEscrowV2Address() : undefined;
  const escrowLegacy = onPolygon ? getEscrowAddress() : undefined;
  // New bets use v3; existing bets settle against the address stored on their
  // row (bet.escrowAddress), so older contracts keep working untouched.
  const escrow = escrowV3 ?? escrowV2 ?? escrowLegacy;
  const tokens = useMemo(() => getTokens(), []);
  return {
    chainId: POLYGON_CHAIN_ID,
    escrow,
    escrowV3,
    escrowV2,
    escrowLegacy,
    tokens,
    isSupported: onPolygon && !!escrow,
    onPolygon,
  };
}
