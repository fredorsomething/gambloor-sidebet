import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { createDirectMessage } from "@/lib/directMessages";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { formatToken, shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DECIMAL = /^[0-9]+$/;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * GET /api/bets/[id]/negotiations?viewer=0x..
 * Viewer-aware: the proposer sees every counter-offer; anyone else only sees the
 * offers they sent. Keeps negotiations private between each taker and proposer.
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
      ...(isProposer ? {} : viewer ? { fromAddress: viewer } : { id: -1 }),
    },
    orderBy: { createdAt: "desc" },
  });

  return jsonOk({
    isProposer,
    proposer: bet.proposer,
    status: bet.status,
    negotiations,
  });
}

const PostSchema = z.object({
  from: z.string().refine(isAddress, "bad address"),
  proposerStake: z.string().regex(DECIMAL, "proposerStake must be a uint string"),
  acceptorStake: z.string().regex(DECIMAL, "acceptorStake must be a uint string"),
  terms: z.string().max(10_000).optional(),
  message: z.string().max(1000).optional(),
});

/** POST /api/bets/[id]/negotiations — send a counter-offer to the proposer. */
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
  if (from.toLowerCase() === bet.proposer.toLowerCase()) {
    return jsonErr("you can't negotiate your own bet", 400);
  }
  if (BigInt(d.proposerStake) <= 0n || BigInt(d.acceptorStake) <= 0n) {
    return jsonErr("stakes must be positive", 400);
  }

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Cap the number of pending offers a single taker can have open on a bet.
  const openCount = await prisma.betNegotiation.count({
    where: { betId: id, fromAddress: from.toLowerCase(), status: "Pending" },
  });
  if (openCount >= 3) {
    return jsonErr("you already have pending offers on this bet", 429);
  }

  const negotiation = await prisma.betNegotiation.create({
    data: {
      betId: id,
      fromAddress: from.toLowerCase(),
      proposerStake: d.proposerStake,
      acceptorStake: d.acceptorStake,
      terms: d.terms?.trim() || null,
      message: d.message?.trim() || null,
      status: "Pending",
    },
  });

  const sym = bet.tokenSymbol || "tokens";
  const proposerAmt = formatToken(BigInt(d.proposerStake), bet.decimals);
  const acceptorAmt = formatToken(BigInt(d.acceptorStake), bet.decimals);
  const fromLc = from.toLowerCase();

  const negotiator = await prisma.user.findFirst({
    where: { address: { equals: from, mode: "insensitive" } },
    select: { username: true },
  });
  const negotiatorLabel = negotiator?.username
    ? `@${negotiator.username}`
    : shortAddr(from);

  let dmBody = `Counter-offer on "${bet.title}"\n\n`;
  dmBody += `Your stake (proposer): ${proposerAmt} ${sym}\n`;
  dmBody += `Their stake (acceptor): ${acceptorAmt} ${sym}\n`;
  if (d.terms?.trim()) dmBody += `\nRevised terms:\n${d.terms.trim()}\n`;
  if (d.message?.trim()) dmBody += `\nNote: ${d.message.trim()}\n`;
  dmBody += `\nReview the offer: /bets/${id}\n`;
  dmBody += `Reply here to discuss or send a revised counter-offer.`;

  const dm = await createDirectMessage({
    sender: fromLc,
    recipient: bet.proposer,
    body: dmBody,
  });

  await notify({
    recipient: bet.proposer,
    type: "status",
    title: `Counter-offer from ${negotiatorLabel}`,
    body: `New terms on "${bet.title}" — open Messages to discuss.`,
    link: dm ? `/messages?with=${fromLc}` : `/bets/${id}`,
  });

  return jsonOk({ negotiation }, { status: 201 });
}
