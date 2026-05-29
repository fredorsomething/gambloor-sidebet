import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { collectDirectoryUsers } from "@/lib/directory";
import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Combined search across sidebets, CLOB markets and users. GET ?q=&chainId= */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const chainId = Number(req.nextUrl.searchParams.get("chainId")) || undefined;

  if (q.length < 1) return jsonOk({ bets: [], markets: [], users: [] });

  const isHex = /^0x[0-9a-fA-F]+$/.test(q);
  const lower = q.toLowerCase();

  const [bets, markets, profileUsers] = await Promise.all([
    prisma.bet.findMany({
      where: {
        ...(chainId ? { chainId } : {}),
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        status: true,
        amount: true,
        decimals: true,
        tokenSymbol: true,
      },
    }),
    prisma.market.findMany({
      where: {
        ...(chainId ? { chainId } : {}),
        status: { not: "Rejected" },
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        status: true,
        tokenSymbol: true,
        _count: { select: { outcomes: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
          ...(isHex
            ? [{ address: { contains: q, mode: "insensitive" } }]
            : []),
        ] as Prisma.UserWhereInput["OR"],
      },
      take: 8,
      select: {
        address: true,
        username: true,
        avatarUrl: true,
        bio: true,
        verified: true,
      },
    }),
  ]);

  // Profile matches first; for hex/address queries also include un-profiled
  // wallets discovered across the rest of the platform.
  const usersByAddr = new Map<string, (typeof profileUsers)[number]>();
  for (const u of profileUsers) usersByAddr.set(u.address.toLowerCase(), u);

  if (isHex && usersByAddr.size < 8) {
    const all = await collectDirectoryUsers();
    for (const u of all) {
      if (usersByAddr.size >= 8) break;
      const key = u.address.toLowerCase();
      if (key.includes(lower) && !usersByAddr.has(key)) {
        usersByAddr.set(key, {
          address: u.address,
          username: u.username,
          avatarUrl: u.avatarUrl,
          bio: u.bio,
          verified: u.verified,
        });
      }
    }
  }

  const marketItems = markets.map((m) => ({
    id: m.id,
    title: m.title,
    imageUrl: m.imageUrl,
    status: m.status,
    tokenSymbol: m.tokenSymbol,
    outcomeCount: m._count.outcomes,
  }));

  return jsonOk({
    bets,
    markets: marketItems,
    users: Array.from(usersByAddr.values()).slice(0, 8),
  });
}
