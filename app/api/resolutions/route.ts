import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { isAdminAddress, ADMIN_ADDRESS } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  canProposeResolution,
  loadSubject,
  type SubjectType,
} from "@/lib/resolutionSubject";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SubjectEnum = z.enum(["bet", "market"]);

/**
 * GET /api/resolutions
 *  - ?subjectType=bet&subjectId=1  → latest proposal for that subject (public)
 *  - ?address=0x..&status=Pending  → admin-only list of proposals to review
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const subjectType = sp.get("subjectType");
  const subjectIdRaw = sp.get("subjectId");

  if (subjectType && subjectIdRaw) {
    const parsedType = SubjectEnum.safeParse(subjectType);
    const subjectId = Number(subjectIdRaw);
    if (!parsedType.success || !Number.isInteger(subjectId) || subjectId <= 0) {
      return jsonErr("bad subject", 400);
    }
    const proposal = await prisma.resolutionProposal.findFirst({
      where: { subjectType: parsedType.data, subjectId },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ proposal });
  }

  // Admin list.
  const addrRaw = sp.get("address") ?? "";
  if (!isAddress(addrRaw)) return jsonErr("bad address", 400);
  const address = getAddress(addrRaw);
  if (!isAdminAddress(address)) return jsonErr("forbidden", 403);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const status = sp.get("status") ?? "Pending";
  const proposals = await prisma.resolutionProposal.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Enrich with subject title/link/outcomes for the dashboard.
  const enriched = await Promise.all(
    proposals.map(async (p) => {
      const subject = await loadSubject(
        p.subjectType as SubjectType,
        p.subjectId,
      );
      return {
        ...p,
        subjectTitle: subject?.title ?? `#${p.subjectId}`,
        subjectLink: subject?.link ?? null,
        outcomeLabel:
          subject?.outcomes?.[p.proposedOutcome] ?? `Outcome ${p.proposedOutcome}`,
      };
    }),
  );

  return jsonOk({ proposals: enriched });
}

const PostSchema = z.object({
  proposedBy: z.string().refine(isAddress, "bad address"),
  subjectType: SubjectEnum,
  subjectId: z.number().int().positive(),
  proposedOutcome: z.number().int().min(0).max(31),
  note: z.string().trim().max(500).optional(),
});

/** POST /api/resolutions — propose a resolution; routes to admin for review. */
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
  const proposer = getAddress(d.proposedBy);

  const auth = await verifyWalletAuth({ req, address: proposer });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const subject = await loadSubject(d.subjectType, d.subjectId);
  if (!subject) return jsonErr("subject not found", 404);
  if (d.proposedOutcome >= subject.outcomes.length) {
    return jsonErr("invalid outcome", 400);
  }

  const allowed = await canProposeResolution(
    d.subjectType,
    d.subjectId,
    proposer,
  );
  if (!allowed) {
    return jsonErr("only participants can propose a resolution", 403);
  }

  // Block duplicate pending proposals for the same subject.
  const existing = await prisma.resolutionProposal.findFirst({
    where: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      status: "Pending",
    },
  });
  if (existing) {
    return jsonErr("a resolution is already under review for this", 409);
  }

  const proposal = await prisma.resolutionProposal.create({
    data: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      proposedBy: proposer.toLowerCase(),
      proposedOutcome: d.proposedOutcome,
      note: d.note ?? null,
      status: "Pending",
    },
  });

  const outcomeLabel =
    subject.outcomes[d.proposedOutcome] ?? `Outcome ${d.proposedOutcome}`;

  // Notify the admin/verifier.
  await notify({
    recipient: ADMIN_ADDRESS.toLowerCase(),
    type: "resolution_proposed",
    title: "New resolution to verify",
    body: `${shortAddr(proposer)} proposed "${outcomeLabel}" for ${subject.title}`,
    link: "/admin",
  });

  return jsonOk({ proposal }, { status: 201 });
}
