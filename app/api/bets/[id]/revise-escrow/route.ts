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

const DECIMAL = /^[0-9]+$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;

const ReviseSchema = z.object({
  actor: z.string().refine(isAddress, "bad address"),
  onchainId: z.string().regex(DECIMAL, "onchainId must be a uint string"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  termsHash: z.string().regex(HEX64, "termsHash must be 0x + 64 hex"),
  nonce: z.string().min(1).max(80),
  proposerStake: z.string().regex(DECIMAL),
  acceptorStake: z.string().regex(DECIMAL),
  acceptDeadline: z.number().int().positive().optional(),
});

/**
 * POST /api/bets/[id]/revise-escrow
 * After the proposer creates a new on-chain offer, attach it to the existing
 * indexed bet (same URL / id) instead of creating a duplicate listing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const betId = parseId(params.id);
  if (!betId) return jsonErr("bad bet id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = ReviseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;
  const actor = getAddress(d.actor);
  const actorLc = actor.toLowerCase();

  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) return jsonErr("bet not found", 404);
  if (bet.proposer.toLowerCase() !== actorLc) {
    return jsonErr("only the proposer can publish a revised offer", 403);
  }
  if (!bet.escrowRevisionNeeded || !bet.lockedNegotiationId) {
    return jsonErr("this bet has no pending escrow revision", 409);
  }

  const negotiation = await prisma.betNegotiation.findUnique({
    where: { id: bet.lockedNegotiationId },
  });
  if (!negotiation || negotiation.status !== "Accepted") {
    return jsonErr("locked negotiation not found or not accepted", 409);
  }

  if (
    d.proposerStake !== bet.proposerStake ||
    d.acceptorStake !== bet.acceptorStake ||
    d.termsHash.toLowerCase() !== bet.termsHash.toLowerCase() ||
    d.nonce !== bet.nonce
  ) {
    return jsonErr("on-chain payload does not match locked terms", 400);
  }

  const auth = await verifyWalletAuth({ req, address: actor });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const updated = await prisma.bet.update({
    where: { id: betId },
    data: {
      onchainId: d.onchainId,
      txHash: d.txHash,
      status: "Open",
      acceptor: null,
      escrowRevisionNeeded: false,
      ...(d.acceptDeadline != null
        ? { acceptDeadline: BigInt(d.acceptDeadline) }
        : {}),
    },
  });

  if (bet.intendedAcceptor) {
    await notify({
      recipient: bet.intendedAcceptor,
      type: "status",
      title: "Updated offer is live",
      body: `New stakes for "${bet.title}" are on-chain — you can take the bet now.`,
      link: `/bets/${betId}`,
    });
  }

  return jsonOk({ bet: updated });
}
