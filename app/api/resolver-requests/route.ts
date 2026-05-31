import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolverRequestSelect } from "@/lib/resolverRequestPrisma";
import { notify } from "@/lib/notifications";
import {
  applyApprovedResolver,
  resolverCounterparty,
  validateResolverRequest,
} from "@/lib/resolverRequests";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

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
    select: resolverRequestSelect,
  });
  return jsonOk({ requests });
}

const PostSchema = z.object({
  requestedBy: z.string().refine(isAddress, "bad address"),
  subjectType: z.enum(["bet", "market"]),
  subjectId: z.number().int().positive(),
  suggested: z.string().refine(isAddress, "bad address"),
  reason: z.string().max(1000).optional(),
});

/** POST /api/resolver-requests — ask the counterparty to approve a new resolver. */
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

  const gate = await validateResolverRequest(
    d.subjectType,
    d.subjectId,
    requester,
    d.suggested,
  );
  if (!gate.ok) return jsonErr(gate.reason, gate.status ?? 400);

  const existing = await prisma.resolverRequest.findFirst({
    where: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      status: "Pending",
    },
    select: { id: true },
  });
  if (existing) {
    return jsonErr("a resolver request is already pending approval", 409);
  }

  const request = await prisma.resolverRequest.create({
    data: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      requestedBy: requester.toLowerCase(),
      suggested: gate.suggested.toLowerCase(),
      reason: d.reason?.trim() || null,
      status: "Pending",
    },
  });

  await notify({
    recipient: gate.counterparty,
    type: "status",
    title: "Resolver change requested",
    body: `Your counterparty wants ${shortAddr(gate.suggested)} to resolve "${gate.title}". Review and approve or decline.`,
    link: gate.link,
  });

  return jsonOk({ request }, { status: 201 });
}
