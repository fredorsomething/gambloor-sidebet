import type { Address } from "viem";
import { polygon } from "wagmi/chains";

/** Polygon mainnet only (chain id 137). */
export const POLYGON_CHAIN_ID = polygon.id;

export const SUPPORTED_CHAINS = [polygon] as const;
export type SupportedChainId = typeof polygon.id;

export const DEFAULT_CHAIN_ID: SupportedChainId = polygon.id;

/**
 * Collateral on Polygon mainnet. Stakes use USDC or pUSD (ERC-20).
 * Gas for transactions uses native POL.
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
};

export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON ||
  process.env.NEXT_PUBLIC_ESCROW_ADDRESS ||
  undefined) as Address | undefined;

export function getEscrowAddress(_chainId?: number): Address | undefined {
  return ESCROW_ADDRESS;
}

/** SidebetEscrowV2 — the current escrow used for new bets. */
export const ESCROW_V2_ADDRESS = (process.env
  .NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON || undefined) as Address | undefined;

export function getEscrowV2Address(_chainId?: number): Address | undefined {
  return ESCROW_V2_ADDRESS;
}

/** ConditionalTokens (ERC-1155 outcome shares) for CLOB markets. */
export const CTF_ADDRESS = (process.env.NEXT_PUBLIC_CTF_ADDRESS_POLYGON ||
  undefined) as Address | undefined;

export function getCtfAddress(_chainId?: number): Address | undefined {
  return CTF_ADDRESS;
}

/** CTFExchange (EIP-712 order settlement) for CLOB markets. */
export const EXCHANGE_ADDRESS = (process.env
  .NEXT_PUBLIC_EXCHANGE_ADDRESS_POLYGON || undefined) as Address | undefined;

export function getExchangeAddress(_chainId?: number): Address | undefined {
  return EXCHANGE_ADDRESS;
}

/** Your wallet as default settler on the create-bet form (optional). */
export const DEFAULT_SETTLER = process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim() as
  | Address
  | undefined;

export function getTokens(_chainId?: number) {
  return TOKENS[polygon.id];
}

export function getTokenBySymbol(_chainId: number, symbol: string) {
  return getTokens().find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
  );
}

export function getTokenByAddress(_chainId: number, address: Address) {
  const a = address.toLowerCase();
  return getTokens().find((t) => t.address.toLowerCase() === a);
}

export function explorerTx(_chainId: number, hash: string) {
  return `https://polygonscan.com/tx/${hash}`;
}

export function explorerAddress(_chainId: number, addr: string) {
  return `https://polygonscan.com/address/${addr}`;
}
