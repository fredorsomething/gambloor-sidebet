import { parseUnits } from "viem";

import { getMarketCollateralToken } from "@/lib/chains";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { fetchZeroXPrice, ZEROX_NATIVE } from "@/lib/zerox";

export const dynamic = "force-dynamic";

/** Indicative USD price for 1 POL via 0x (POL → USDC.e). */
const ONE_POL = parseUnits("1", 18);
/** 0x price endpoint only needs a valid address shape, not a funded wallet. */
const PRICE_TAKER = "0x0000000000000000000000000000000000000001";

async function polUsdFromCoingecko(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd",
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      "polygon-ecosystem-token"?: { usd?: number };
    };
    const usd = json["polygon-ecosystem-token"]?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

/** GET /api/wallet/pol-usd — USD value of 1 POL for wallet totals. */
export async function GET() {
  const usdce = getMarketCollateralToken();

  try {
    const data = await fetchZeroXPrice({
      sellToken: ZEROX_NATIVE,
      buyToken: usdce.address,
      sellAmount: ONE_POL.toString(),
      taker: PRICE_TAKER,
      slippageBps: 100,
    });
    const usdPerPol = Number(data.buyAmount) / 10 ** usdce.decimals;
    if (Number.isFinite(usdPerPol) && usdPerPol > 0) {
      return jsonOk({ usdPerPol });
    }
  } catch {
    /* fall through to CoinGecko */
  }

  const fallback = await polUsdFromCoingecko();
  if (fallback != null) return jsonOk({ usdPerPol: fallback });

  return jsonErr("Could not fetch POL price", 502);
}
