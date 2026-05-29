import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { ADMIN_ADDRESS } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/resolver-requests?subjectType=bet&subjectId=1 — list for a subject. */
export async function GET(req: NextRequest) {
  const subjectType = req.nextUrl.searchParams.get("subjectType");
  const subjectId = Number(req.nextUrl.searchParams.get("subjectId"));
  if (subjectType !== "bet" && subjectType !== "market") {
    return jsonErr("bad subjectType", 400);
  }
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return jsonErr("bad subjectId", 400);
  }

  const requests = await prisma.resolverRequest.findMany({
    where: { subjectType, subjectId },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ requests });
}

const PostSchema = z.object({
  requestedBy: z.string().refine(isAddress, "bad address"),
  subjectType: z.enum(["bet", "market"]),
  subjectId: z.number().int().positive(),
  suggested: z.string().refine(isAddress, "bad address").optional(),
  reason: z.string().max(1000).optional(),
});

/** POST /api/resolver-requests — ask admins to add an additional resolver. */
export async function POST(req: NextRequest) {
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

  const requester = getAddress(d.requestedBy);
  const auth = await verifyWalletAuth({ req, address: requester });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Confirm the subject exists and grab its title for the notification.
  let title = "";
  if (d.subjectType === "bet") {
    const bet = await prisma.bet.findUnique({ where: { id: d.subjectId } });
    if (!bet) return jsonErr("bet not found", 404);
    title = bet.title;
  } else {
    const market = await prisma.market.findUnique({ where: { id: d.subjectId } });
    if (!market) return jsonErr("market not found", 404);
    title = market.title;
  }

  // One open request per (subject, requester).
  const existing = await prisma.resolverRequest.findFirst({
    where: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      requestedBy: requester.toLowerCase(),
      status: "Pending",
    },
  });
  if (existing) {
    return jsonErr("you already have a pending request for this", 409);
  }

  const request = await prisma.resolverRequest.create({
    data: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      requestedBy: requester.toLowerCase(),
      suggested: d.suggested ? getAddress(d.suggested).toLowerCase() : null,
      reason: d.reason?.trim() || null,
      status: "Pending",
    },
  });

  const link =
    d.subjectType === "bet" ? `/bets/${d.subjectId}` : `/markets/${d.subjectId}`;
  await notify({
    recipient: ADMIN_ADDRESS,
    type: "status",
    title: "Additional resolver requested",
    body: `Someone requested an extra resolver for "${title}".`,
    link,
  });

  return jsonOk({ request }, { status: 201 });
}
