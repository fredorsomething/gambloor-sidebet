import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { createDirectMessage } from "@/lib/directMessages";
import { prisma } from "@/lib/db";
import { betUpdateFromAcceptedNegotiation } from "@/lib/negotiations";
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
 * - accept / decline: recipient of the offer only.
 * - withdraw: sender of the offer.
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
  const actorLc = actor.toLowerCase();

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
  const toAddr = (negotiation.toAddress ?? bet.proposer).toLowerCase();
  const isRecipient = actorLc === toAddr;
  const isSender = actorLc === negotiation.fromAddress.toLowerCase();

  if (action === "withdraw" && !isSender) {
    return jsonErr("only the sender can withdraw this offer", 403);
  }
  if ((action === "accept" || action === "decline") && !isRecipient) {
    return jsonErr("only the recipient can accept or decline this offer", 403);
  }

  const auth = await verifyWalletAuth({ req, address: actor });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const nextStatus =
    action === "accept" ? "Accepted" : action === "decline" ? "Declined" : "Withdrawn";

  const toAddress = toAddr;
  const updated = await prisma.$transaction(async (tx) => {
    const neg = await tx.betNegotiation.update({
      where: { id: negId },
      data: { status: nextStatus },
    });

    if (action === "accept") {
      if (bet.status !== "Open") {
        throw new Error("BET_NOT_OPEN");
      }
      const lock = betUpdateFromAcceptedNegotiation(bet, {
        id: neg.id,
        fromAddress: negotiation.fromAddress,
        toAddress,
        proposerStake: negotiation.proposerStake,
        acceptorStake: negotiation.acceptorStake,
        terms: negotiation.terms,
      });
      await tx.bet.update({
        where: { id: betId },
        data: lock,
      });
      await tx.betNegotiation.updateMany({
        where: {
          betId,
          status: "Pending",
          id: { not: negId },
        },
        data: { status: "Declined" },
      });
    }

    return neg;
  }).catch((err: Error) => {
    if (err.message === "BET_NOT_OPEN") {
      return null;
    }
    throw err;
  });

  if (!updated) {
    return jsonErr("this bet is no longer open to negotiate", 409);
  }

  const notifyTarget =
    action === "withdraw" ? toAddr : negotiation.fromAddress;

  await createDirectMessage({
    sender: actorLc,
    recipient: notifyTarget,
    body: "",
    negotiationId: updated.id,
  });

  if (action === "accept") {
    await notify({
      recipient: negotiation.fromAddress,
      type: "status",
      title: "Counter-offer accepted",
      body: `Your terms on "${bet.title}" are locked in. The proposer will refresh the on-chain offer on the same sidebet.`,
      link: `/bets/${betId}`,
    });
    await notify({
      recipient: bet.proposer,
      type: "status",
      title: "Publish updated offer",
      body: `Terms on "${bet.title}" are locked in — update the on-chain escrow on the same sidebet page.`,
      link: `/bets/${betId}#revise-escrow`,
    });
  } else if (action === "decline") {
    await notify({
      recipient: negotiation.fromAddress,
      type: "status",
      title: "Counter-offer declined",
      body: `Your terms on "${bet.title}" were declined.`,
      link: `/messages?with=${toAddr}&bet=${betId}`,
    });
  }

  return jsonOk({
    negotiation: {
      ...updated,
      toAddress: updated.toAddress ?? bet.proposer,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
