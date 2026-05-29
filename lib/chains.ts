import type { Address } from "viem";
import { polygon, polygonAmoy } from "wagmi/chains";

export const SUPPORTED_CHAINS = [polygon, polygonAmoy] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export const DEFAULT_CHAIN_ID: SupportedChainId =
  (Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID) as SupportedChainId) ||
  polygonAmoy.id;

/**
 * Canonical token list per chain. All entries use 6 decimals (matches USDC/pUSD).
 * On Amoy testnet there is no official pUSD; we expose a mock-USDC slot that
 * deployers can fill in (or the user can paste a custom token address).
 */
export const TOKENS: Record<
  SupportedChainId,
  { symbol: string; name: string; address: Address; decimals: number }[]
> = {
  [polygon.id]: [
    {
      symbol: "USDC",
      name: "USD Coin (native)",
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
    },
    {
      symbol: "pUSD",
      name: "Polymarket USD",
      address: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
      decimals: 6,
    },
    {
      symbol: "USDC.e",
      name: "USD Coin (bridged)",
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      decimals: 6,
    },
  ],
  [polygonAmoy.id]: [
    // Circle's official USDC on Amoy testnet
    {
      symbol: "USDC",
      name: "USD Coin (Amoy testnet)",
      address: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
      decimals: 6,
    },
  ],
};

export const ESCROW_ADDRESSES: Record<SupportedChainId, Address | undefined> = {
  [polygon.id]: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON ||
    undefined) as Address | undefined,
  [polygonAmoy.id]: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS_AMOY ||
    undefined) as Address | undefined,
};

export function getEscrowAddress(chainId: number): Address | undefined {
  return ESCROW_ADDRESSES[chainId as SupportedChainId];
}

export function getTokens(chainId: number) {
  return TOKENS[chainId as SupportedChainId] ?? [];
}

export function getTokenBySymbol(chainId: number, symbol: string) {
  return getTokens(chainId).find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
  );
}

export function getTokenByAddress(chainId: number, address: Address) {
  const a = address.toLowerCase();
  return getTokens(chainId).find((t) => t.address.toLowerCase() === a);
}

export function explorerTx(chainId: number, hash: string) {
  if (chainId === polygon.id) return `https://polygonscan.com/tx/${hash}`;
  if (chainId === polygonAmoy.id) return `https://amoy.polygonscan.com/tx/${hash}`;
  return "";
}

export function explorerAddress(chainId: number, addr: string) {
  if (chainId === polygon.id) return `https://polygonscan.com/address/${addr}`;
  if (chainId === polygonAmoy.id)
    return `https://amoy.polygonscan.com/address/${addr}`;
  return "";
}
