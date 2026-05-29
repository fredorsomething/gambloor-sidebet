import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { isAdminAddress } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineReloadMarket } from "@/lib/engineClient";

export const dynamic = "force-dynamic";

const Schema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  action: z.enum(["approve", "reject"]),
});

/** POST /api/markets/[id]/approve — admin approves or rejects a pending market. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

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

  const market = await prisma.market.findUnique({ where: { id } });
  if (!market) return jsonErr("not found", 404);
  if (market.status !== "Pending") {
    return jsonErr("market is not pending approval", 409);
  }

  const approved = parsed.data.action === "approve";
  const updated = await prisma.market.update({
    where: { id },
    data: { status: approved ? "Open" : "Rejected" },
    include: { outcomes: { orderBy: { index: "asc" } } },
  });

  // Let the engine pick up the new status (it caches market metadata).
  if (approved) {
    await engineReloadMarket(id).catch(() => {});
  }

  await notify({
    recipient: market.creator,
    type: approved ? "market_approved" : "market_rejected",
    title: approved ? "Market approved" : "Market not approved",
    body: approved
      ? `"${market.title}" is now live and open for trading.`
      : `"${market.title}" was not approved by the admin.`,
    link: approved ? `/markets/${market.id}` : null,
  });

  return jsonOk(updated);
}
