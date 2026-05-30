import { NextRequest } from "next/server";
import { getAddress } from "viem";

import { loadBetResolutionState } from "@/lib/betResolution";
import {
  canAutoSettleBet,
  autoSettleDiagnostics,
  platformAutoSettleReady,
  tryAutoSettleBet,
} from "@/lib/autoSettle";
import { applyBetOnchainSync } from "@/lib/betSync";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { readBetV2 } from "@/lib/onchain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  let bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("not found", 404);

  if (bet.escrowRevisionNeeded && bet.status === "Cancelled") {
    try {
      await prisma.bet.update({ where: { id }, data: { status: "Open" } });
      bet.status = "Open";
    } catch (err) {
      console.warn("escrow revision status heal failed", err);
    }
  }

  const onchain = await readBetV2(
    bet.chainId,
    getAddress(bet.escrowAddress) as `0x${string}`,
    BigInt(bet.onchainId),
  );

  if (onchain && !bet.escrowRevisionNeeded) {
    await applyBetOnchainSync(bet, onchain, { notify: false });
    bet = (await prisma.bet.findUnique({ where: { id } })) ?? bet;
  }

  const resolution =
    bet.status === "Matched" || bet.status === "Settled"
      ? await loadBetResolutionState(bet)
      : null;

  let autoSettle: Awaited<ReturnType<typeof tryAutoSettleBet>> | null = null;
  const autoSettleStatus = {
    ...autoSettleDiagnostics(),
    canSettleThisBet: canAutoSettleBet(bet),
  };
  if (
    bet.status === "Matched" &&
    resolution &&
    platformAutoSettleReady() &&
    canAutoSettleBet(bet) &&
    ((resolution.consensus === "unanimous" &&
      resolution.agreedOutcome != null) ||
      resolution.verifiedOutcome != null)
  ) {
    autoSettle = await tryAutoSettleBet(id).catch((err) => {
      console.error(`auto-settle on bet GET #${id}`, err);
      return {
        ok: false as const,
        betId: id,
        reason: "auto-settle error",
      };
    });
    if (autoSettle.ok) {
      const refreshed = await prisma.bet.findUnique({ where: { id } });
      if (refreshed) bet = refreshed;
    }
  }

  return jsonOk({
    bet,
    onchain,
    autoSettle,
    autoSettleStatus,
    resolution: resolution
      ? {
          proposer: resolution.proposer,
          acceptor: resolution.acceptor,
          consensus: resolution.consensus,
          agreedOutcome: resolution.agreedOutcome,
          verifiedOutcome: resolution.verifiedOutcome,
        }
      : undefined,
  });
}
