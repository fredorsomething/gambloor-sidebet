import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { jsonErr, jsonOk } from "@/lib/serialize";
import { fetchZeroXPrice, fetchZeroXQuote } from "@/lib/zerox";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  mode: z.enum(["price", "quote"]),
  sellToken: z.string(),
  buyToken: z.string(),
  sellAmount: z.string().regex(/^\d+$/),
  taker: z.string(),
  slippageBps: z.coerce.number().min(0).max(5000).optional(),
});

/**
 * GET /api/swap/quote — proxy 0x Swap API (allowance-holder) so the API key
 * stays server-side. Use mode=price for indicative pricing, mode=quote to execute.
 */
export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) return jsonErr("invalid query", 400);

  const { mode, sellToken, buyToken, sellAmount, taker, slippageBps } =
    parsed.data;
  if (!isAddress(taker)) return jsonErr("bad taker address", 400);

  try {
    const args = {
      sellToken,
      buyToken,
      sellAmount,
      taker: getAddress(taker),
      slippageBps,
    };
    const data =
      mode === "price"
        ? await fetchZeroXPrice(args)
        : await fetchZeroXQuote(args);
    return jsonOk(data);
  } catch (err) {
    const msg = (err as Error).message || "Swap quote failed";
    return jsonErr(msg, 502);
  }
}
