import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { marketForApi, marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  terms: z.string().min(1).max(10_000).optional(),
  imageUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => isAllowedImageUrl(u), "invalid image url")
    .nullable()
    .optional(),
  status: z
    .enum(["Pending", "Open", "Resolved", "Rejected", "Removed"])
    .optional(),
});

/** PATCH /api/admin/markets/[id] — edit market metadata or status. */
export async function PATCH(
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const gate = await requireAdmin(req, parsed.data.admin);
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const market = await prisma.market.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!market) return jsonErr("not found", 404);

  const { admin: _a, ...fields } = parsed.data;
  const updated = await prisma.market.update({
    where: { id },
    data: fields,
    select: marketWithOutcomesSelect,
  });

  return jsonOk({ market: marketForApi(updated) });
}

const DeleteSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
});

/** DELETE /api/admin/markets/[id] — soft-remove market from public listings. */
export async function DELETE(
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
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const gate = await requireAdmin(req, parsed.data.admin);
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const market = await prisma.market.update({
    where: { id },
    data: { status: "Removed" },
    select: marketWithOutcomesSelect,
  });

  return jsonOk({ market: marketForApi(market) });
}
