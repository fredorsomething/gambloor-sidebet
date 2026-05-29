import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { isAdminAddress } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notifications";
import { loadSubject, type SubjectType } from "@/lib/resolutionSubject";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const Schema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/** POST /api/resolutions/[id] — admin verifies (approves) or rejects. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return jsonErr("bad id", 400);

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
  const admin = getAddress(parsed.data.address);
  if (!isAdminAddress(admin)) return jsonErr("forbidden", 403);

  const auth = await verifyWalletAuth({ req, address: admin });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const proposal = await prisma.resolutionProposal.findUnique({
    where: { id },
  });
  if (!proposal) return jsonErr("not found", 404);
  if (proposal.status !== "Pending") {
    return jsonErr("already reviewed", 409);
  }

  const approved = parsed.data.action === "approve";
  const updated = await prisma.resolutionProposal.update({
    where: { id },
    data: {
      status: approved ? "Approved" : "Rejected",
      reviewedBy: admin.toLowerCase(),
      reviewNote: parsed.data.note ?? null,
    },
  });

  const subject = await loadSubject(
    proposal.subjectType as SubjectType,
    proposal.subjectId,
  );
  const outcomeLabel =
    subject?.outcomes?.[proposal.proposedOutcome] ??
    `Outcome ${proposal.proposedOutcome}`;
  const title = subject?.title ?? `#${proposal.subjectId}`;
  const link = subject?.link ?? null;

  if (approved) {
    await notifyMany(
      [proposal.proposedBy, ...(subject?.participants ?? [])],
      {
        type: "resolution_verified",
        title: "Resolution verified",
        body: `"${outcomeLabel}" was verified for ${title}. The settler will finalize it.`,
        link,
      },
    );
  } else {
    await notify({
      recipient: proposal.proposedBy,
      type: "resolution_rejected",
      title: "Resolution rejected",
      body: `Your proposed resolution for ${title} was not approved.${
        parsed.data.note ? ` Note: ${parsed.data.note}` : ""
      }`,
      link,
    });
  }

  return jsonOk({ proposal: updated });
}
