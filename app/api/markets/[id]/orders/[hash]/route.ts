import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { verifyWalletAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; hash: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const order = await prisma.order.findUnique({ where: { hash: params.hash } });
  if (!order || order.marketId !== id) return jsonErr("order not found", 404);

  const auth = await verifyWalletAuth({ req, address: order.maker });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  if (auth.address.toLowerCase() !== order.maker.toLowerCase()) {
    return jsonErr("only the maker can cancel this order", 403);
  }

  await prisma.order.update({
    where: { hash: params.hash },
    data: { status: "Cancelled" },
  });

  return jsonOk({ ok: true });
}
