import { getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";

export type DirectoryUser = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string | null;
};

/** Normalise to a checksummed address, or null if it isn't a valid address. */
function checksum(addr: string | null | undefined): string | null {
  if (!addr) return null;
  try {
    if (!isAddress(addr)) return null;
    return getAddress(addr);
  } catch {
    return null;
  }
}

/**
 * Collect every wallet address that has interacted with the platform, not just
 * the ones that saved a profile. We union the addresses found across bets,
 * markets, orders, trades, comments, rep votes and the User table itself, then
 * attach profile data where it exists.
 */
export async function collectDirectoryUsers(): Promise<DirectoryUser[]> {
  const [
    users,
    bets,
    markets,
    orders,
    trades,
    profileComments,
    threadComments,
    repVotes,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        address: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    }),
    prisma.bet.findMany({ select: { proposer: true, acceptor: true } }),
    prisma.market.findMany({ select: { creator: true } }),
    prisma.order.findMany({ select: { maker: true }, distinct: ["maker"] }),
    prisma.trade.findMany({
      select: { taker: true, maker: true },
    }),
    prisma.profileComment.findMany({
      select: { author: true, target: true },
    }),
    prisma.threadComment.findMany({
      select: { author: true },
      distinct: ["author"],
    }),
    prisma.repVote.findMany({ select: { target: true }, distinct: ["target"] }),
  ]);

  // Build the profile lookup keyed by lowercased address.
  const profileByAddr = new Map<
    string,
    (typeof users)[number]
  >();
  for (const u of users) {
    profileByAddr.set(u.address.toLowerCase(), u);
  }

  // Union of every address we've seen anywhere, keyed by checksum address.
  const seen = new Map<string, string>(); // lower -> checksum
  const add = (raw: string | null | undefined) => {
    const cs = checksum(raw);
    if (!cs) return;
    const lower = cs.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, cs);
  };

  for (const u of users) add(u.address);
  for (const b of bets) {
    add(b.proposer);
    add(b.acceptor);
  }
  for (const m of markets) add(m.creator);
  for (const o of orders) add(o.maker);
  for (const t of trades) {
    add(t.taker);
    add(t.maker);
  }
  for (const c of profileComments) {
    add(c.author);
    add(c.target);
  }
  for (const c of threadComments) add(c.author);
  for (const v of repVotes) add(v.target);

  const result: DirectoryUser[] = [];
  for (const [lower, cs] of seen.entries()) {
    const profile = profileByAddr.get(lower);
    result.push({
      address: cs,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      bio: profile?.bio ?? null,
      joinedAt: profile?.createdAt?.toISOString() ?? null,
    });
  }
  return result;
}
