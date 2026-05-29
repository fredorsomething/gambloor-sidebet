"use client";

import { useMemo } from "react";
import { useChainId } from "wagmi";
import { polygon } from "wagmi/chains";

import {
  getCtfAddress,
  getEscrowAddress,
  getEscrowV2Address,
  getExchangeAddress,
  getMarketCollateralToken,
  getTokens,
  POLYGON_CHAIN_ID,
} from "@/lib/chains";

/** Resolves escrow (v2) + tokens on Polygon mainnet. */
export function useEscrow() {
  const chainId = useChainId();
  const onPolygon = chainId === polygon.id;
  const escrowV2 = onPolygon ? getEscrowV2Address() : undefined;
  const escrowLegacy = onPolygon ? getEscrowAddress() : undefined;
  // New bets use v2; fall back to legacy only if v2 isn't configured yet.
  const escrow = escrowV2 ?? escrowLegacy;
  const tokens = useMemo(() => getTokens(), []);
  return {
    chainId: POLYGON_CHAIN_ID,
    escrow,
    escrowV2,
    escrowLegacy,
    tokens,
    isSupported: onPolygon && !!escrow,
    onPolygon,
  };
}

/** Resolves CLOB market contracts (ConditionalTokens + Exchange) on Polygon. */
export function useMarketContracts() {
  const chainId = useChainId();
  const onPolygon = chainId === polygon.id;
  const ctf = onPolygon ? getCtfAddress() : undefined;
  const exchange = onPolygon ? getExchangeAddress() : undefined;
  const tokens = useMemo(() => [getMarketCollateralToken()], []);
  return {
    chainId: POLYGON_CHAIN_ID,
    ctf,
    exchange,
    tokens,
    isSupported: onPolygon && !!ctf && !!exchange,
    onPolygon,
  };
}
