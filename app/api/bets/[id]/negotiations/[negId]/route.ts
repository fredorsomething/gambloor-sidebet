import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PatchSchema = z.object({
  actor: z.string().refine(isAddress, "bad address"),
  action: z.enum(["accept", "decline", "withdraw"]),
});

/**
 * PATCH /api/bets/[id]/negotiations/[negId]
 * - accept / decline: proposer only.
 * - withdraw: the negotiator who sent the offer.
 * Only Pending offers can change state.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; negId: string } },
) {
  const betId = parseId(params.id);
  const negId = parseId(params.negId);
  if (!betId || !negId) return jsonErr("bad id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const actor = getAddress(parsed.data.actor);
  const action = parsed.data.action;

  const negotiation = await prisma.betNegotiation.findUnique({
    where: { id: negId },
    include: { bet: true },
  });
  if (!negotiation || negotiation.betId !== betId) {
    return jsonErr("offer not found", 404);
  }
  if (negotiation.status !== "Pending") {
    return jsonErr("this offer has already been resolved", 409);
  }

  const bet = negotiation.bet;
  const isProposer = actor.toLowerCase() === bet.proposer.toLowerCase();
  const isNegotiator = actor.toLowerCase() === negotiation.fromAddress.toLowerCase();

  if (action === "withdraw" && !isNegotiator) {
    return jsonErr("only the sender can withdraw this offer", 403);
  }
  if ((action === "accept" || action === "decline") && !isProposer) {
    return jsonErr("only the proposer can respond to this offer", 403);
  }

  const auth = await verifyWalletAuth({ req, address: actor });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const nextStatus =
    action === "accept" ? "Accepted" : action === "decline" ? "Declined" : "Withdrawn";

  const updated = await prisma.betNegotiation.update({
    where: { id: negId },
    data: { status: nextStatus },
  });

  if (action === "accept") {
    await notify({
      recipient: negotiation.fromAddress,
      type: "status",
      title: "Counter-offer accepted",
      body: `Your terms on "${bet.title}" were accepted. The proposer will relaunch the bet with the agreed terms.`,
      link: `/bets/${betId}`,
    });
  } else if (action === "decline") {
    await notify({
      recipient: negotiation.fromAddress,
      type: "status",
      title: "Counter-offer declined",
      body: `Your terms on "${bet.title}" were declined.`,
      link: `/bets/${betId}`,
    });
  }

  return jsonOk({ negotiation: updated });
}
