import { prisma } from "@/lib/db";

export type CommentScope = "thread" | "profile";

export const MARKET_COMMENT_RATE_LIMIT_MS = 60 * 1000; // 1 minute
export const BET_COMMENT_RATE_LIMIT_MS = 60 * 1000; // 1 minute
export const PROFILE_COMMENT_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

export function formatCommentRetryAfter(retryAfterSec: number): string {
  return retryAfterSec >= 60
    ? `${Math.ceil(retryAfterSec / 60)} min`
    : `${retryAfterSec} sec`;
}

async function checkRateLimit(
  lastAt: Date | undefined,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (!lastAt) return { ok: true };
  const elapsed = Date.now() - lastAt.getTime();
  if (elapsed >= windowMs) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.ceil((windowMs - elapsed) / 1000),
  };
}

/** One market comment per author per minute (any market). */
export async function checkMarketCommentRateLimit(
  author: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const addr = author.toLowerCase();
  const since = new Date(Date.now() - MARKET_COMMENT_RATE_LIMIT_MS);
  const last = await prisma.threadComment.findFirst({
    where: { author: addr, subjectType: "market", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return checkRateLimit(last?.createdAt, MARKET_COMMENT_RATE_LIMIT_MS);
}

/** One sidebet comment per author per minute (any bet). */
export async function checkBetCommentRateLimit(
  author: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const addr = author.toLowerCase();
  const since = new Date(Date.now() - BET_COMMENT_RATE_LIMIT_MS);
  const last = await prisma.threadComment.findFirst({
    where: { author: addr, subjectType: "bet", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return checkRateLimit(last?.createdAt, BET_COMMENT_RATE_LIMIT_MS);
}

/** One profile-wall comment per author per 10 minutes (any profile). */
export async function checkProfileCommentRateLimit(
  author: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const addr = author.toLowerCase();
  const since = new Date(Date.now() - PROFILE_COMMENT_RATE_LIMIT_MS);
  const last = await prisma.profileComment.findFirst({
    where: { author: addr, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return checkRateLimit(last?.createdAt, PROFILE_COMMENT_RATE_LIMIT_MS);
}

/** Like counts + the viewer's own likes for a set of comment ids in a scope. */
export async function likeInfo(
  scope: CommentScope,
  commentIds: number[],
  viewer?: string | null,
): Promise<{
  counts: Map<number, number>;
  likedByViewer: Set<number>;
}> {
  const counts = new Map<number, number>();
  const likedByViewer = new Set<number>();
  if (commentIds.length === 0) return { counts, likedByViewer };

  const grouped = await prisma.commentLike.groupBy({
    by: ["commentId"],
    where: { scope, commentId: { in: commentIds } },
    _count: { commentId: true },
  });
  for (const g of grouped) counts.set(g.commentId, g._count.commentId);

  if (viewer) {
    const mine = await prisma.commentLike.findMany({
      where: { scope, commentId: { in: commentIds }, liker: viewer.toLowerCase() },
      select: { commentId: true },
    });
    for (const m of mine) likedByViewer.add(m.commentId);
  }

  return { counts, likedByViewer };
}

/** Toggle a like for (scope, commentId, liker). Returns the new state. */
export async function toggleLike(
  scope: CommentScope,
  commentId: number,
  liker: string,
): Promise<{ liked: boolean; likes: number }> {
  const addr = liker.toLowerCase();
  const existing = await prisma.commentLike.findUnique({
    where: { scope_commentId_liker: { scope, commentId, liker: addr } },
  });

  if (existing) {
    await prisma.commentLike.delete({ where: { id: existing.id } });
  } else {
    try {
      await prisma.commentLike.create({ data: { scope, commentId, liker: addr } });
    } catch {
      // unique race — ignore
    }
  }

  const likes = await prisma.commentLike.count({ where: { scope, commentId } });
  return { liked: !existing, likes };
}

const GIF_HOSTS = [
  "media.giphy.com",
  "i.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "giphy.com",
  "media.tenor.com",
  "c.tenor.com",
  "tenor.com",
];

/** Allow only well-known GIF CDN hosts for attached GIFs. */
export function isAllowedGifUrl(url: string): boolean {
  if (!/^https:\/\//.test(url)) return false;
  if (url.length > 600) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return GIF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
