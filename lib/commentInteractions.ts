import { prisma } from "@/lib/db";

export type CommentScope = "thread" | "profile";

/** One comment per author per this window, across both comment surfaces. */
export const COMMENT_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Enforce the global "1 comment / 10 minutes / user" limit. Looks at the
 * author's most recent comment in either the profile wall or thread tables.
 */
export async function checkCommentRateLimit(
  author: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const addr = author.toLowerCase();
  const since = new Date(Date.now() - COMMENT_RATE_LIMIT_MS);

  const [profile, thread] = await Promise.all([
    prisma.profileComment.findFirst({
      where: { author: addr, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.threadComment.findFirst({
      where: { author: addr, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const last = [profile?.createdAt, thread?.createdAt]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!last) return { ok: true };
  const elapsed = Date.now() - last.getTime();
  if (elapsed >= COMMENT_RATE_LIMIT_MS) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.ceil((COMMENT_RATE_LIMIT_MS - elapsed) / 1000),
  };
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
