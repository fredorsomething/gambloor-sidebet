import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { sanitizeStoredBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { DEFAULT_SIDEBET_FEE_BPS } from "@/lib/settlers";

export const dynamic = "force-dynamic";

/** GET /api/admin/settlers?address= — all settlers (approved and revoked). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const settlers = await prisma.approvedSettler.findMany({
    orderBy: { createdAt: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { address: { in: settlers.map((s) => s.address) } },
    select: { address: true, username: true },
  });
  const names = new Map(users.map((u) => [u.address.toLowerCase(), u.username]));

  return jsonOk({
    settlers: settlers.map((s) => ({
      address: s.address,
      username: s.username ?? names.get(s.address.toLowerCase()) ?? null,
      feeBps: s.feeBps,
      approved: s.approved,
    })),
  });
}

const PostSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  address: z.string().refine(isAddress, "bad address"),
  feeBps: z.number().int().min(0).max(2000).default(DEFAULT_SIDEBET_FEE_BPS),
  approved: z.boolean().default(true),
});

/** POST /api/admin/settlers — add or update an approved settler. */
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

  const addr = getAddress(parsed.data.address);
  const user = await prisma.user.findUnique({
    where: { address: addr },
    select: { username: true, badges: true },
  });

  const settler = await prisma.approvedSettler.upsert({
    where: { address: addr },
    update: {
      feeBps: parsed.data.feeBps,
      approved: parsed.data.approved,
      username: user?.username ?? undefined,
    },
    create: {
      address: addr,
      feeBps: parsed.data.feeBps,
      approved: parsed.data.approved,
      username: user?.username ?? null,
    },
  });

  if (parsed.data.approved) {
    const badges = new Set(user?.badges ?? ["User"]);
    badges.add("Resolver");
    await prisma.user.upsert({
      where: { address: addr },
      update: { badges: sanitizeStoredBadges([...badges]) },
      create: { address: addr, badges: sanitizeStoredBadges(["User", "Resolver"]) },
    });
  }

  return jsonOk({ settler });
}

const DeleteSchema = z.object({
  admin: z.string().refine(isAddress, "bad admin"),
  address: z.string().refine(isAddress, "bad address"),
});

/** DELETE /api/admin/settlers — revoke settler approval (keeps row, sets approved=false). */
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

  const addr = getAddress(parsed.data.address);
  const settler = await prisma.approvedSettler.update({
    where: { address: addr },
    data: { approved: false },
  });

  return jsonOk({ settler });
}
