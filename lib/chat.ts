import { prisma } from "@/lib/db";
import { computeUserStats, type StatBet } from "@/lib/stats";

export type ChatMessageRow = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  authorPnl: number;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};

/**
 * Most recent chat messages (oldest→newest) enriched with each author's public
 * profile (username, avatar, verified) and realized PnL.
 */
export async function listChatMessages(limit = 60): Promise<ChatMessageRow[]> {
  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  recent.reverse();

  const authors = Array.from(new Set(recent.map((m) => m.author.toLowerCase())));
  if (authors.length === 0) return [];

  const [users, bets] = await Promise.all([
    prisma.user.findMany({
      where: { address: { in: authors, mode: "insensitive" } },
      select: { address: true, username: true, avatarUrl: true, verified: true },
    }),
    prisma.bet.findMany({
      where: {
        OR: [
          { proposer: { in: authors, mode: "insensitive" } },
          { acceptor: { in: authors, mode: "insensitive" } },
        ],
      },
      select: {
        proposer: true,
        acceptor: true,
        amount: true,
        proposerStake: true,
        acceptorStake: true,
        decimals: true,
        feeBps: true,
        status: true,
        winner: true,
      },
    }),
  ]);

  const profileByAddr = new Map(
    users.map((u) => [u.address.toLowerCase(), u] as const),
  );
  const pnlByAddr = new Map<string, number>();
  for (const a of authors) {
    pnlByAddr.set(a, computeUserStats(bets as StatBet[], a).pnl);
  }

  return recent.map((m) => {
    const lc = m.author.toLowerCase();
    const u = profileByAddr.get(lc);
    return {
      id: m.id,
      author: m.author,
      authorUsername: u?.username ?? null,
      authorAvatarUrl: u?.avatarUrl ?? null,
      authorVerified: u?.verified ?? false,
      authorPnl: pnlByAddr.get(lc) ?? 0,
      body: m.body,
      gifUrl: m.gifUrl ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  });
}

const PRESENCE_WINDOW_MS = 25_000;

/** Record a heartbeat for a browser session, then return the online count. */
export async function touchPresence(
  cid: string,
  address?: string | null,
): Promise<number> {
  if (cid) {
    try {
      await prisma.presence.upsert({
        where: { cid },
        create: { cid, address: address?.toLowerCase() ?? null },
        update: { address: address?.toLowerCase() ?? null },
      });
    } catch {
      /* ignore presence write failures */
    }
  }
  return onlineCount();
}

/**
 * "Users online" = real recent sessions + a small stable fake offset (1–7) so
 * the room never looks empty. The offset is seeded by a 45s time bucket so it
 * stays steady between polls instead of flickering every few seconds.
 */
export async function onlineCount(): Promise<number> {
  const since = new Date(Date.now() - PRESENCE_WINDOW_MS);
  let real = 0;
  try {
    real = await prisma.presence.count({ where: { lastSeen: { gte: since } } });
  } catch {
    real = 0;
  }
  const bucket = Math.floor(Date.now() / 45_000);
  // Deterministic pseudo-random 1..7 from the bucket.
  const hash = Math.abs(Math.sin(bucket) * 10_000);
  const fake = 1 + (Math.floor(hash) % 7);
  return real + fake;
}
