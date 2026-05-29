import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { createDirectMessage } from "@/lib/directMessages";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DECIMAL = /^[0-9]+$/;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function otherParty(
  bet: { proposer: string },
  from: string,
  to: string | undefined,
): string | null {
  const fromLc = from.toLowerCase();
  const proposerLc = bet.proposer.toLowerCase();
  if (fromLc === proposerLc) {
    if (!to || !isAddress(to)) return null;
    const toLc = getAddress(to).toLowerCase();
    if (toLc === proposerLc) return null;
    return toLc;
  }
  return proposerLc;
}

/**
 * GET /api/bets/[id]/negotiations?viewer=0x..
 * Proposer sees every offer on the bet; others only see offers they sent or received.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = parseId(params.id);
  if (!id) return jsonErr("bad bet id", 400);

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("bet not found", 404);

  const viewerRaw = req.nextUrl.searchParams.get("viewer") ?? "";
  const viewer = isAddress(viewerRaw) ? viewerRaw.toLowerCase() : null;
  const isProposer = !!viewer && viewer === bet.proposer.toLowerCase();

  const negotiations = await prisma.betNegotiation.findMany({
    where: {
      betId: id,
      ...(isProposer
        ? {}
        : viewer
          ? {
              OR: [
                { fromAddress: viewer },
                { toAddress: viewer },
              ],
            }
          : { id: -1 }),
    },
    orderBy: { createdAt: "desc" },
  });

  return jsonOk({
    isProposer,
    proposer: bet.proposer,
    status: bet.status,
    negotiations: negotiations.map((n) => ({
      ...n,
      toAddress: n.toAddress ?? bet.proposer,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  });
}

const PostSchema = z.object({
  from: z.string().refine(isAddress, "bad address"),
  to: z.string().refine(isAddress, "bad address").optional(),
  proposerStake: z.string().regex(DECIMAL, "proposerStake must be a uint string"),
  acceptorStake: z.string().regex(DECIMAL, "acceptorStake must be a uint string"),
  terms: z.string().max(10_000).optional(),
  message: z.string().max(1000).optional(),
});

/** POST /api/bets/[id]/negotiations — send a counter-offer (taker or proposer). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = parseId(params.id);
  if (!id) return jsonErr("bad bet id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("bet not found", 404);
  if (bet.status !== "Open") {
    return jsonErr("this bet is no longer open to negotiate", 409);
  }

  const from = getAddress(d.from);
  const fromLc = from.toLowerCase();
  const toLc = otherParty(bet, fromLc, d.to);
  if (!toLc) {
    return jsonErr(
      fromLc === bet.proposer.toLowerCase()
        ? "proposer must specify the counterparty address"
        : "invalid counterparty",
      400,
    );
  }
  if (BigInt(d.proposerStake) <= 0n || BigInt(d.acceptorStake) <= 0n) {
    return jsonErr("stakes must be positive", 400);
  }

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const openCount = await prisma.betNegotiation.count({
    where: {
      betId: id,
      fromAddress: fromLc,
      toAddress: toLc,
      status: "Pending",
    },
  });
  if (openCount >= 3) {
    return jsonErr("you already have pending offers with this person on this bet", 429);
  }

  const negotiation = await prisma.betNegotiation.create({
    data: {
      betId: id,
      fromAddress: fromLc,
      toAddress: toLc,
      proposerStake: d.proposerStake,
      acceptorStake: d.acceptorStake,
      terms: d.terms?.trim() || null,
      message: d.message?.trim() || null,
      status: "Pending",
    },
  });

  const sender = await prisma.user.findFirst({
    where: { address: { equals: from, mode: "insensitive" } },
    select: { username: true },
  });
  const senderLabel = sender?.username ? `@${sender.username}` : shortAddr(from);

  const dm = await createDirectMessage({
    sender: fromLc,
    recipient: toLc,
    body: "",
    negotiationId: negotiation.id,
  });

  await notify({
    recipient: toLc,
    type: "status",
    title: `Counter-offer from ${senderLabel}`,
    body: `New terms on "${bet.title}" — open Messages to review.`,
    link: dm ? `/messages?with=${fromLc}&bet=${id}` : `/bets/${id}`,
  });

  return jsonOk(
    {
      negotiation: {
        ...negotiation,
        createdAt: negotiation.createdAt.toISOString(),
        updatedAt: negotiation.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
