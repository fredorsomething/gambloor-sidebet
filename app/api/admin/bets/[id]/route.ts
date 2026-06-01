import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// Financial state (status, stakes, winner) and `termsHash` stay chain-authoritative.
// Admins may edit off-chain display copy (title, description, rules/terms, image).
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
  hiddenFromFeed: z.boolean().optional(),
});

/** PATCH /api/admin/bets/[id] — edit a sidebet's off-chain display metadata. */
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

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("not found", 404);

  const { admin: _a, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return jsonErr("nothing to update", 400);

  const updated = await prisma.bet.update({ where: { id }, data: fields });
  return jsonOk({ bet: updated });
}

const DeleteSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
});

/** DELETE /api/admin/bets/[id] — hide sidebet from the public homepage feed. */
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

  const bet = await prisma.bet.update({
    where: { id },
    data: { hiddenFromFeed: true },
  });

  return jsonOk({ bet });
}
