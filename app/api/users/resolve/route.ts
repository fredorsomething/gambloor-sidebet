import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";
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
    where: { address: { in: checksummed } },
    select: {
      address: true,
      username: true,
      avatarUrl: true,
      bio: true,
      twitter: true,
      discord: true,
    },
  });

  const out: Record<string, unknown> = {};
  for (const u of users) {
    out[u.address.toLowerCase()] = u;
  }
  return jsonOk(out);
}
