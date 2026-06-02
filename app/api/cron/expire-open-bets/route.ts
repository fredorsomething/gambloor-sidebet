import { NextRequest } from "next/server";

import { expireEligibleOpenBets, expireOpenBetsEnabled } from "@/lib/expireOpenBets";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/expire-open-bets
 * Vercel cron (or manual) trigger. Requires Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonErr("CRON_SECRET not configured", 503);

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return jsonErr("unauthorized", 401);

  if (!expireOpenBetsEnabled()) {
    return jsonErr("SETTLER_PRIVATE_KEY not configured", 503);
  }

  const results = await expireEligibleOpenBets();
  const expired = results.filter((r) => r.ok);
  return jsonOk({
    expired: expired.length,
    skipped: results.length - expired.length,
    results,
  });
}
