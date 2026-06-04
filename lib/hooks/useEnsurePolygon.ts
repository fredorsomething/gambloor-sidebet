"use client";

import { polygon } from "wagmi/chains";

import { useEnsureChain } from "@/lib/hooks/useEnsureChain";

/**
 * Forces the active wallet onto Polygon before a write.
 *
 * Privy embedded wallets can default to Ethereum mainnet. Sending a Polygon
 * contract call from that state fails with an opaque error.
 */
export function useEnsurePolygon() {
  return useEnsureChain(polygon.id);
}
