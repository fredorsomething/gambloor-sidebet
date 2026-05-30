import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { isAdminAddress } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineSettleMarket, EngineError } from "@/lib/engineClient";

export const dynamic = "force-dynamic";

const Schema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  winningOutcome: z.number().int().min(0).max(15),
});

/**
 * POST /api/markets/[id]/resolve
 * The market's settler (or an admin) resolves the market. This sets the winning
 * outcome and triggers custodial settlement in the engine: winning shares are
 * redeemed 1:1 into collateral, losing shares are zeroed, the reserve drains and
 * all resting orders are cancelled with their locks refunded.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const caller = getAddress(parsed.data.address);

  const market = await prisma.market.findUnique({
    where: { id },
    include: { outcomes: true },
  });
  if (!market) return jsonErr("not found", 404);
  if (market.status === "Resolved") return jsonErr("already resolved", 409);
  if (market.status !== "Open") return jsonErr("market is not open", 409);

  const isSettler = caller.toLowerCase() === market.settler.toLowerCase();
  const isAdmin = isAdminAddress(caller);
  if (!isSettler && !isAdmin) {
    return jsonErr("only the settler or an admin can resolve", 403);
  }
  if (!market.outcomes.some((o) => o.index === parsed.data.winningOutcome)) {
    return jsonErr("bad winning outcome", 400);
  }

  const auth = await verifyWalletAuth({ req, address: caller });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Two-step settlement: an outcome must be admin-verified (an Approved
  // resolution proposal) before the settler can trigger the payout. Admins can
  // settle directly (their action IS the approval). This makes admin approval
  // the gate for the actual settlement and payout.
  if (!isAdmin) {
    const approved = await prisma.resolutionProposal.findFirst({
      where: { subjectType: "market", subjectId: id, status: "Approved" },
      orderBy: { createdAt: "desc" },
    });
    if (!approved) {
      return jsonErr(
        "an admin must verify the outcome before it can be settled",
        409,
      );
    }
    if (approved.proposedOutcome !== parsed.data.winningOutcome) {
      return jsonErr(
        "winning outcome must match the admin-verified outcome",
        409,
      );
    }
  }

  // Settle in the engine first (redeem shares, drain reserve, clear book).
  try {
    await engineSettleMarket(id, parsed.data.winningOutcome);
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("settle failed", err);
    return jsonErr("failed to settle market", 500);
  }

  const updated = await prisma.market.update({
    where: { id },
    data: { status: "Resolved", winningOutcome: parsed.data.winningOutcome },
    include: { outcomes: { orderBy: { index: "asc" } } },
  });

  const winLabel =
    market.outcomes.find((o) => o.index === parsed.data.winningOutcome)?.label ??
    `Outcome ${parsed.data.winningOutcome}`;
  await notify({
    recipient: market.creator,
    type: "market_resolved",
    title: "Your market resolved",
    body: `"${market.title}" resolved to ${winLabel}.`,
    link: `/markets/${market.id}`,
  });

  return jsonOk(updated);
}
