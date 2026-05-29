import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { sanitizeStoredBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/admin/users?address=&q= — lookup users for the admin dashboard. */
export async function GET(req: NextRequest) {
  const adminAddr = req.nextUrl.searchParams.get("address") ?? "";
  const gate = await requireAdmin(req, adminAddr);
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const exact = req.nextUrl.searchParams.get("target") ?? "";

  if (exact && isAddress(exact)) {
    const address = getAddress(exact);
    const user = await prisma.user.findUnique({ where: { address } });
    return jsonOk({
      users: user
        ? [
            {
              address: user.address,
              username: user.username,
              verified: user.verified,
              badges: user.badges,
            },
          ]
        : [],
    });
  }

  if (!q) return jsonOk({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 25,
    orderBy: { updatedAt: "desc" },
    select: {
      address: true,
      username: true,
      verified: true,
      badges: true,
    },
  });

  return jsonOk({ users });
}

const PatchSchema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  admin: z.string().refine(isAddress, "bad admin"),
  verified: z.boolean().optional(),
  badges: z.array(z.string()).optional(),
});

/** PATCH /api/admin/users — verify users and set profile badges. */
export async function PATCH(req: NextRequest) {
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

  const target = getAddress(parsed.data.address);
  const data: { verified?: boolean; badges?: string[] } = {};
  if (parsed.data.verified !== undefined) data.verified = parsed.data.verified;
  if (parsed.data.badges !== undefined) {
    data.badges = sanitizeStoredBadges(parsed.data.badges);
  }

  const user = await prisma.user.upsert({
    where: { address: target },
    update: data,
    create: {
      address: target,
      verified: parsed.data.verified ?? false,
      badges: sanitizeStoredBadges(parsed.data.badges),
    },
    select: {
      address: true,
      username: true,
      verified: true,
      badges: true,
    },
  });

  return jsonOk({ user });
}
