import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Combined search across markets (bets) and users. GET ?q=&chainId= */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const chainId = Number(req.nextUrl.searchParams.get("chainId")) || undefined;

  if (q.length < 1) return jsonOk({ markets: [], users: [] });

  const isHex = /^0x[0-9a-fA-F]+$/.test(q);

  const [markets, users] = await Promise.all([
    prisma.bet.findMany({
      where: {
        ...(chainId ? { chainId } : {}),
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        amount: true,
        decimals: true,
        tokenSymbol: true,
      },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          ...(isHex ? [{ address: { contains: q } }] : []),
        ],
      },
      take: 8,
      select: { address: true, username: true, avatarUrl: true, bio: true },
    }),
  ]);

  return jsonOk({ markets, users });
}
