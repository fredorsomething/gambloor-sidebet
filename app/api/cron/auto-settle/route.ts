import { NextRequest } from "next/server";

import {
  autoSettleEligibleBets,
  autoSettleEnabled,
  platformAutoSettleReady,
} from "@/lib/autoSettle";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/auto-settle
 * Vercel cron (or manual) trigger. Requires Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonErr("CRON_SECRET not configured", 503);

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return jsonErr("unauthorized", 401);

  if (!autoSettleEnabled()) {
    return jsonErr("SETTLER_PRIVATE_KEY not configured", 503);
  }
  if (!platformAutoSettleReady()) {
    return jsonErr(
      "SETTLER_PRIVATE_KEY does not match platform admin settler",
      503,
    );
  }

  const results = await autoSettleEligibleBets();
  const settled = results.filter((r) => r.ok);
  return jsonOk({
    settled: settled.length,
    skipped: results.length - settled.length,
    results,
  });
}
