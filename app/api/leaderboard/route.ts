import { NextRequest } from "next/server";
import { getAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/serialize";
import { computeLeaderboard, type StatBet } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get("chainId")) || undefined;
  const limit = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50),
  );

  const bets = await prisma.bet.findMany({
    where: chainId ? { chainId } : undefined,
    select: {
      proposer: true,
      acceptor: true,
      amount: true,
      decimals: true,
      feeBps: true,
      status: true,
      winner: true,
    },
  });

  const entries = computeLeaderboard(bets as StatBet[]).slice(0, limit);

  // Attach profiles. Stats keys are lowercased; profiles are stored checksummed.
  const checksummed = entries.map((e) => getAddress(e.address));
  const users = checksummed.length
    ? await prisma.user.findMany({
        where: { address: { in: checksummed } },
        select: { address: true, username: true, avatarUrl: true, verified: true },
      })
    : [];
  const profileMap = new Map(users.map((u) => [u.address.toLowerCase(), u]));

  const ranked = entries.map((e, i) => ({
    rank: i + 1,
    ...e,
    username: profileMap.get(e.address.toLowerCase())?.username ?? null,
    avatarUrl: profileMap.get(e.address.toLowerCase())?.avatarUrl ?? null,
    verified: profileMap.get(e.address.toLowerCase())?.verified ?? false,
  }));

  return jsonOk({ items: ranked });
}
