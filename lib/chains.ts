import type { Address } from "viem";
import { mainnet, polygon } from "wagmi/chains";

/** Polygon mainnet only (chain id 137). */
export const POLYGON_CHAIN_ID = polygon.id;

export const ETHEREUM_CHAIN_ID = mainnet.id;

/** Circle USDC on Ethereum — Privy card deposits sometimes land here instead of Polygon. */
export const ETHEREUM_USDC = {
  symbol: "USDC",
  name: "USD Coin",
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  decimals: 6,
} as const;

export const CHAIN_LABELS: Record<number, string> = {
  [ETHEREUM_CHAIN_ID]: "Ethereum",
  [POLYGON_CHAIN_ID]: "Polygon",
};

/** Official Polygon PoS bridge (Ethereum → Polygon). */
export const POLYGON_BRIDGE_URL =
  "https://portal.polygon.technology/bridge";

export const SUPPORTED_CHAINS = [polygon] as const;
export type SupportedChainId = typeof polygon.id;

export const DEFAULT_CHAIN_ID: SupportedChainId = polygon.id;

/**
 * ERC-20 tokens held in user wallets on Polygon.
 * New sidebets and markets settle in USDC.e only; USDC and pUSD remain
 * swappable and withdrawable for legacy balances.
 * Gas uses native POL.
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

/** Platform default settler (@admin) on the create-bet form. */
export const DEFAULT_SETTLER = (process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim() ||
  "0x445525f628D4840e2F14148f2547e6F270Caa3eb") as Address;

export function getTokens(_chainId?: number) {
  return TOKENS[polygon.id];
}

/** Stablecoins shown in wallet UI (balances, deposit, withdraw, swap). */
export const WALLET_STABLE_SYMBOLS = ["USDC", "pUSD", "USDC.e"] as const;

export function getWalletStablecoins(_chainId?: number) {
  const allowed = new Set<string>(WALLET_STABLE_SYMBOLS);
  return getTokens(_chainId).filter((t) => allowed.has(t.symbol));
}

export type WithdrawAsset = {
  symbol: string;
  decimals: number;
  address?: Address;
};

/** Withdraw picker options: all wallet stables plus POL (USDC.e first). */
export function getWithdrawAssets(_chainId?: number): WithdrawAsset[] {
  const bySymbol = new Map(
    getWalletStablecoins(_chainId).map((t) => [t.symbol, t] as const),
  );
  const stables = WALLET_STABLE_SYMBOLS.map((sym) => bySymbol.get(sym))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({
      symbol: t.symbol,
      decimals: t.decimals,
      address: t.address,
    }));
  return [
    ...stables,
    { symbol: "POL", decimals: 18, address: undefined },
  ];
}

/** CLOB markets settle only in bridged USDC.e on Polygon. */
export const MARKET_COLLATERAL_SYMBOL = "USDC.e" as const;

export function getMarketCollateralToken(_chainId?: number) {
  const t = getTokenBySymbol(POLYGON_CHAIN_ID, MARKET_COLLATERAL_SYMBOL);
  if (!t) throw new Error("USDC.e collateral not configured");
  return t;
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

/** Prefer on-chain registry symbol; fall back to stored label or market default. */
export function resolveTokenSymbol(
  address: Address | string | undefined,
  storedSymbol?: string | null,
  fallback: string = MARKET_COLLATERAL_SYMBOL,
): string {
  if (address) {
    const known = getTokenByAddress(POLYGON_CHAIN_ID, address as Address);
    if (known) return known.symbol;
  }
  return storedSymbol?.trim() || fallback;
}

export function explorerTx(_chainId: number, hash: string) {
  return `https://polygonscan.com/tx/${hash}`;
}

export function explorerAddress(_chainId: number, addr: string) {
  return `https://polygonscan.com/address/${addr}`;
}
