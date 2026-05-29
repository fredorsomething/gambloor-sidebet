import type { Address } from "viem";

import { getTokenBySymbol, POLYGON_CHAIN_ID } from "@/lib/chains";

/** 0x API sentinel for native assets (POL on Polygon). */
export const ZEROX_NATIVE =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export type SwapAssetSymbol = "USDC.e" | "pUSD" | "USDC" | "POL";

export type SwapAsset = {
  symbol: SwapAssetSymbol;
  decimals: number;
  /** ERC-20 address; undefined for POL. */
  address?: Address;
  /** Token passed to 0x (`ZEROX_NATIVE` for POL). */
  zeroxAddress: string;
};

export const SWAP_ASSETS: SwapAsset[] = [
  {
    symbol: "USDC.e",
    decimals: 6,
    address: getTokenBySymbol(POLYGON_CHAIN_ID, "USDC.e")!.address,
    zeroxAddress: getTokenBySymbol(POLYGON_CHAIN_ID, "USDC.e")!.address,
  },
  {
    symbol: "pUSD",
    decimals: 6,
    address: getTokenBySymbol(POLYGON_CHAIN_ID, "pUSD")!.address,
    zeroxAddress: getTokenBySymbol(POLYGON_CHAIN_ID, "pUSD")!.address,
  },
  {
    symbol: "USDC",
    decimals: 6,
    address: getTokenBySymbol(POLYGON_CHAIN_ID, "USDC")!.address,
    zeroxAddress: getTokenBySymbol(POLYGON_CHAIN_ID, "USDC")!.address,
  },
  {
    symbol: "POL",
    decimals: 18,
    zeroxAddress: ZEROX_NATIVE,
  },
];

export function getSwapAsset(symbol: string): SwapAsset | undefined {
  return SWAP_ASSETS.find((a) => a.symbol === symbol);
}

const ZEROX_BASE = "https://api.0x.org";

export type ZeroXPriceResponse = {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  liquidityAvailable?: boolean;
  minBuyAmount?: string;
  issues?: {
    allowance?: { spender: string } | null;
    balance?: unknown;
  };
};

export type ZeroXQuoteResponse = ZeroXPriceResponse & {
  transaction: {
    to: string;
    data: string;
    gas?: string;
    gasPrice?: string;
    value: string;
  };
  permit2?: { eip712: unknown } | null;
};

function feeParams(sellToken: string, buyToken: string): URLSearchParams {
  const p = new URLSearchParams();
  const recipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT?.trim();
  const bps = process.env.NEXT_PUBLIC_FEE_BPS?.trim();
  if (recipient && bps && Number(bps) > 0) {
    p.set("swapFeeRecipient", recipient);
    p.set("swapFeeBps", bps);
    // Fee denominated in the buy token (0x convention for integrator fees).
    p.set("swapFeeToken", buyToken);
    p.set("tradeSurplusRecipient", recipient);
  }
  return p;
}

export async function fetchZeroXPrice(args: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: number;
}): Promise<ZeroXPriceResponse> {
  const key = process.env.ZEROX_API_KEY?.trim();
  if (!key) throw new Error("0x API is not configured");

  const params = new URLSearchParams({
    chainId: String(POLYGON_CHAIN_ID),
    sellToken: args.sellToken,
    buyToken: args.buyToken,
    sellAmount: args.sellAmount,
    taker: args.taker,
    slippageBps: String(args.slippageBps ?? 100),
  });
  for (const [k, v] of feeParams(args.sellToken, args.buyToken)) {
    params.set(k, v);
  }

  const res = await fetch(
    `${ZEROX_BASE}/swap/allowance-holder/price?${params}`,
    {
      headers: { "0x-api-key": key, "0x-version": "v2" },
      cache: "no-store",
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.reason || json?.message || "Could not fetch price");
  }
  return json as ZeroXPriceResponse;
}

export async function fetchZeroXQuote(args: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: number;
}): Promise<ZeroXQuoteResponse> {
  const key = process.env.ZEROX_API_KEY?.trim();
  if (!key) throw new Error("0x API is not configured");

  const params = new URLSearchParams({
    chainId: String(POLYGON_CHAIN_ID),
    sellToken: args.sellToken,
    buyToken: args.buyToken,
    sellAmount: args.sellAmount,
    taker: args.taker,
    slippageBps: String(args.slippageBps ?? 100),
  });
  for (const [k, v] of feeParams(args.sellToken, args.buyToken)) {
    params.set(k, v);
  }

  const res = await fetch(
    `${ZEROX_BASE}/swap/allowance-holder/quote?${params}`,
    {
      headers: { "0x-api-key": key, "0x-version": "v2" },
      cache: "no-store",
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.reason || json?.message || "Could not fetch quote");
  }
  return json as ZeroXQuoteResponse;
}
