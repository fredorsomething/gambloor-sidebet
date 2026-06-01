import { NextRequest } from "next/server";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { attributeReferral } from "@/lib/referrals";

export const dynamic = "force-dynamic";

const Schema = z.object({
  address: z.string(),
  slug: z.string().min(1).max(32),
});

/** POST /api/referrals/attribution — link signed-in wallet to a referral campaign. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return jsonErr("invalid body");

  const auth = await verifyWalletAuth({ req, address: parsed.data.address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const result = await attributeReferral(auth.address, parsed.data.slug);
  if (!result.ok) return jsonErr(result.error, 400);
  return jsonOk({ attributed: result.attributed });
}
