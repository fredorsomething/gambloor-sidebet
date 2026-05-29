import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { resolveDisplayBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { publicUserSelect } from "@/lib/publicProfile";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Batch-resolve addresses → public profile. GET ?addresses=0x..,0x.. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("addresses") ?? "";
  const checksummed: string[] = [];
  for (const part of raw.split(",")) {
    const a = part.trim();
    if (isAddress(a)) checksummed.push(getAddress(a));
  }
  if (checksummed.length === 0) return jsonOk({});

  const users = await prisma.user.findMany({
    where: {
      OR: checksummed.map((a) => ({
        address: { equals: a, mode: "insensitive" as const },
      })),
    },
    select: publicUserSelect,
  });

  const out: Record<string, (typeof users)[number]> = {};
  for (const u of users) {
    out[u.address.toLowerCase()] = {
      ...u,
      verified: u.verified ?? false,
      badges: resolveDisplayBadges(u.badges, u.address),
    };
  }
  return jsonOk(out);
}
