import { parseAbi, type Address } from "viem";

import { getTokenBySymbol } from "@/lib/chains";

/** Polymarket CollateralOnramp — USDC.e → pUSD (1:1). */
export const COLLATERAL_ONRAMP =
  "0x93070a847efEf7F70739046A929D47a521F5B8ee" as Address;

/** Polymarket CollateralOfframp — pUSD → USDC.e (1:1). */
export const COLLATERAL_OFFRAMP =
  "0x2957922Eb93258b93368531d39fAcCA3B4dC5854" as Address;

export const WRAP_ABI = parseAbi([
  "function wrap(address _asset, address _to, uint256 _amount)",
  "function unwrap(address _asset, address _to, uint256 _amount)",
]);

export function usdceAddress(): Address {
  return getTokenBySymbol(137, "USDC.e")!.address;
}

export function pusdAddress(): Address {
  return getTokenBySymbol(137, "pUSD")!.address;
}

export function isWrapPair(sellSymbol: string, buySymbol: string): boolean {
  return (
    (sellSymbol === "USDC.e" && buySymbol === "pUSD") ||
    (sellSymbol === "pUSD" && buySymbol === "USDC.e")
  );
}

export function isWrapDirection(sellSymbol: string, buySymbol: string): boolean {
  return sellSymbol === "USDC.e" && buySymbol === "pUSD";
}
