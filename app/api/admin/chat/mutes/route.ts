import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/admin/chat/mutes?address= — active and recent chat mutes. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const mutes = await prisma.chatMute.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const users = await prisma.user.findMany({
    where: { address: { in: mutes.map((m) => m.address) } },
    select: { address: true, username: true },
  });
  const names = new Map(users.map((u) => [u.address.toLowerCase(), u.username]));

  return jsonOk({
    mutes: mutes.map((m) => ({
      address: m.address,
      username: names.get(m.address) ?? null,
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
      permanent: !m.mutedUntil,
      reason: m.reason,
      mutedBy: m.mutedBy,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const PostSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  target: z.string().refine(isAddress, "bad target"),
  hours: z.number().int().min(1).max(24 * 365).optional(),
  permanent: z.boolean().optional(),
  reason: z.string().max(200).optional(),
});

/** POST /api/admin/chat/mutes — mute a user from global chat. */
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

  const gate = await requireAdmin(req, parsed.data.admin);
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const target = getAddress(parsed.data.target).toLowerCase();
  const permanent = parsed.data.permanent ?? !parsed.data.hours;
  const mutedUntil = permanent
    ? null
    : new Date(Date.now() + (parsed.data.hours ?? 24) * 3_600_000);

  const mute = await prisma.chatMute.upsert({
    where: { address: target },
    update: {
      mutedUntil,
      reason: parsed.data.reason?.trim() || null,
      mutedBy: gate.address.toLowerCase(),
    },
    create: {
      address: target,
      mutedUntil,
      reason: parsed.data.reason?.trim() || null,
      mutedBy: gate.address.toLowerCase(),
    },
  });

  return jsonOk({ mute });
}

const DeleteSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  target: z.string().refine(isAddress, "bad target"),
});

/** DELETE /api/admin/chat/mutes — unmute a user. */
export async function DELETE(req: NextRequest) {
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

  const target = getAddress(parsed.data.target).toLowerCase();
  await prisma.chatMute.deleteMany({ where: { address: target } });
  return jsonOk({ ok: true });
}
