import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

async function ethUsdFromCoingecko(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { ethereum?: { usd?: number } };
    const usd = json.ethereum?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

/** GET /api/wallet/eth-usd — USD value of 1 ETH for wallet totals. */
export async function GET() {
  const usdPerEth = await ethUsdFromCoingecko();
  if (usdPerEth != null) return jsonOk({ usdPerEth });

  return jsonErr("Could not fetch ETH price", 502);
}
