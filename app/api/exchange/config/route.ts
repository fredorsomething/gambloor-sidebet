import { getMarketCollateralToken, POLYGON_CHAIN_ID } from "@/lib/chains";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/config
 * Public custodial-exchange config: the treasury deposit address and the
 * collateral token. Users deposit by sending USDC.e to the treasury; the bridge
 * credits their internal balance.
 */
export async function GET() {
  const token = getMarketCollateralToken();
  return jsonOk({
    chainId: POLYGON_CHAIN_ID,
    treasury: process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? null,
    token: {
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
    },
    wsUrl: process.env.NEXT_PUBLIC_ENGINE_WS_URL ?? null,
  });
}
