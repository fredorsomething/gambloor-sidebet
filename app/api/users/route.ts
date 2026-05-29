import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/users?q=foo — public directory of users.
 * Returns named users first (A-Z by username), then unnamed wallets.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const users = await prisma.user.findMany({
    where,
    select: {
      address: true,
      username: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
    },
    take: 1000,
  });

  // Sort: named users alphabetically (case-insensitive), unnamed wallets last.
  users.sort((a, b) => {
    const an = a.username?.toLowerCase();
    const bn = b.username?.toLowerCase();
    if (an && bn) return an.localeCompare(bn);
    if (an) return -1;
    if (bn) return 1;
    return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
  });

  return jsonOk({
    users: users.map((u) => ({
      address: u.address,
      username: u.username,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      joinedAt: u.createdAt.toISOString(),
    })),
  });
}
