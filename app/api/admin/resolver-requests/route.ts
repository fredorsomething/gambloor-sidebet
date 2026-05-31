import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { sanitizeStoredBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { resolverRequestSelect } from "@/lib/resolverRequestPrisma";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { DEFAULT_SIDEBET_FEE_BPS } from "@/lib/settlers";

export const dynamic = "force-dynamic";

/** GET /api/admin/resolver-requests?address=&status=Pending */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const status = req.nextUrl.searchParams.get("status") ?? "Pending";
  const requests = await prisma.resolverRequest.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: resolverRequestSelect,
  });

  const enriched = await Promise.all(
    requests.map(async (r) => {
      let subjectTitle = `#${r.subjectId}`;
      if (r.subjectType === "bet") {
        const bet = await prisma.bet.findUnique({
          where: { id: r.subjectId },
          select: { title: true },
        });
        subjectTitle = bet?.title ?? subjectTitle;
      } else {
        const market = await prisma.market.findUnique({
          where: { id: r.subjectId },
          select: { title: true },
        });
        subjectTitle = market?.title ?? subjectTitle;
      }
      return {
        ...r,
        subjectTitle,
        subjectLink:
          r.subjectType === "bet"
            ? `/bets/${r.subjectId}`
            : `/markets/${r.subjectId}`,
      };
    }),
  );

  return jsonOk({ requests: enriched });
}

const ReviewSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
});

/** POST /api/admin/resolver-requests — approve adds suggested settler when provided. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const gate = await requireAdmin(req, parsed.data.admin);
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const row = await prisma.resolverRequest.findUnique({
    where: { id: parsed.data.id },
    select: resolverRequestSelect,
  });
  if (!row) return jsonErr("not found", 404);
  if (row.status !== "Pending") return jsonErr("already reviewed", 409);

  const approved = parsed.data.action === "approve";
  await prisma.resolverRequest.update({
    where: { id: row.id },
    data: {
      status: approved ? "Approved" : "Rejected",
      reviewedBy: gate.address.toLowerCase(),
    },
  });

  if (approved && row.suggested && isAddress(row.suggested)) {
    const addr = getAddress(row.suggested);
    await prisma.approvedSettler.upsert({
      where: { address: addr },
      update: { approved: true },
      create: { address: addr, feeBps: DEFAULT_SIDEBET_FEE_BPS, approved: true },
    });
    const user = await prisma.user.findUnique({
      where: { address: addr },
      select: { badges: true },
    });
    const badges = new Set(user?.badges ?? ["User"]);
    badges.add("Resolver");
    await prisma.user.upsert({
      where: { address: addr },
      update: { badges: sanitizeStoredBadges([...badges]) },
      create: { address: addr, badges: sanitizeStoredBadges(["User", "Resolver"]) },
    });
  }

  await notify({
    recipient: row.requestedBy,
    type: "status",
    title: approved ? "Resolver request approved" : "Resolver request declined",
    body: approved
      ? "An admin approved your request for an additional resolver."
      : "Your resolver request was declined.",
    link:
      row.subjectType === "bet"
        ? `/bets/${row.subjectId}`
        : `/markets/${row.subjectId}`,
  });

  return jsonOk({ ok: true });
}
