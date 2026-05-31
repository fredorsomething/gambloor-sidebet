import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  applyApprovedResolver,
  resolverCounterparty,
  validateResolverRequest,
} from "@/lib/resolverRequests";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RespondSchema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  action: z.enum(["approve", "reject"]),
});

/** POST /api/resolver-requests/[id]/respond — counterparty approves or declines. */
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
  const parsed = RespondSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const caller = getAddress(parsed.data.address);
  const auth = await verifyWalletAuth({ req, address: caller });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const row = await prisma.resolverRequest.findUnique({ where: { id } });
  if (!row) return jsonErr("not found", 404);
  if (row.status !== "Pending") return jsonErr("request is no longer pending", 409);
  if (!row.suggested || !isAddress(row.suggested)) {
    return jsonErr("request has no suggested resolver", 409);
  }

  const subject = await (row.subjectType === "bet"
    ? prisma.bet.findUnique({ where: { id: row.subjectId } })
    : prisma.market.findUnique({ where: { id: row.subjectId } }));
  if (!subject) return jsonErr("subject not found", 404);

  const counterparty = resolverCounterparty(
    row.subjectType as "bet" | "market",
    subject,
    row.requestedBy,
  );
  if (!counterparty || counterparty !== caller.toLowerCase()) {
    return jsonErr("only the counterparty can respond to this request", 403);
  }

  const approved = parsed.data.action === "approve";
  if (approved) {
    const gate = await validateResolverRequest(
      row.subjectType as "bet" | "market",
      row.subjectId,
      row.requestedBy,
      row.suggested,
    );
    if (!gate.ok) return jsonErr(gate.reason, gate.status ?? 409);

    await prisma.resolverRequest.update({
      where: { id },
      data: {
        status: "Approved",
        approvedBy: caller.toLowerCase(),
      },
    });
    await applyApprovedResolver(
      row.subjectType as "bet" | "market",
      row.subjectId,
      row.suggested,
    );

    await notify({
      recipient: row.requestedBy,
      type: "status",
      title: "Resolver approved",
      body: `Your counterparty approved ${shortAddr(row.suggested)} as the resolver.`,
      link: gate.link,
    });

    return jsonOk({ ok: true, approved: true });
  }

  await prisma.resolverRequest.update({
    where: { id },
    data: { status: "Rejected", approvedBy: caller.toLowerCase() },
  });

  const link =
    row.subjectType === "bet"
      ? `/bets/${row.subjectId}`
      : `/markets/${row.subjectId}`;
  await notify({
    recipient: row.requestedBy,
    type: "status",
    title: "Resolver request declined",
    body: "Your counterparty declined the proposed resolver change.",
    link,
  });

  return jsonOk({ ok: true, approved: false });
}
