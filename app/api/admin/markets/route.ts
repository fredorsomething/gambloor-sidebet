import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { marketForApi, marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/admin/markets?address=&status=&q= — list markets for admin management. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const status = req.nextUrl.searchParams.get("status")?.trim();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const where: {
    status?: string | { in: string[] };
    OR?: { title?: { contains: string; mode: "insensitive" } }[];
  } = {};

  if (status && status !== "all") {
    where.status = status.includes(",")
      ? { in: status.split(",").map((s) => s.trim()) }
      : status;
  }
  if (q) {
    where.OR = [{ title: { contains: q, mode: "insensitive" } }];
  }

  const markets = await prisma.market.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: marketWithOutcomesSelect,
  });

  return jsonOk({ markets: markets.map((m) => marketForApi(m)) });
}
