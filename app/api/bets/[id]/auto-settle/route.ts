import { NextRequest } from "next/server";

import {
  autoSettleEnabled,
  canAutoSettleBet,
  platformAutoSettleReady,
  tryAutoSettleBet,
} from "@/lib/autoSettle";
import { loadBetResolutionState } from "@/lib/betResolution";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bets/[id]/auto-settle
 * Server-side settler wallet finalizes payout when an outcome is approved.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  if (!autoSettleEnabled()) {
    return jsonErr("SETTLER_PRIVATE_KEY not configured", 503);
  }
  if (!platformAutoSettleReady()) {
    return jsonErr(
      "SETTLER_PRIVATE_KEY does not match the platform admin settler wallet",
      503,
    );
  }

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("not found", 404);
  if (bet.status !== "Matched") {
    return jsonErr(`bet status is ${bet.status}`, 409);
  }
  if (!canAutoSettleBet(bet)) {
    return jsonErr("server wallet is not this bet's on-chain settler", 409);
  }

  const state = await loadBetResolutionState(bet);
  const ready =
    (state.consensus === "unanimous" && state.agreedOutcome != null) ||
    state.verifiedOutcome != null;
  if (!ready) {
    return jsonErr("no approved outcome to settle yet", 409);
  }

  const result = await tryAutoSettleBet(id, { force: true });
  if (!result.ok) {
    return jsonErr(result.reason, 502);
  }

  const refreshed = await prisma.bet.findUnique({ where: { id } });
  return jsonOk({ bet: refreshed, autoSettle: result });
}
