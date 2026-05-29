import { prisma } from "@/lib/db";
import { likeInfo } from "@/lib/commentInteractions";

export type SubjectType = "bet" | "market";

export type ThreadCommentRow = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  body: string;
  gifUrl: string | null;
  parentId: number | null;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
};

/**
 * List comments on a sidebet or market thread, joined with the author's profile
 * (username + avatar) and like info. Returns a flat list; the client nests
 * replies by `parentId`. `viewer` (optional) marks which comments the viewer liked.
 */
export async function listThreadComments(
  subjectType: SubjectType,
  subjectId: number,
  viewer?: string | null,
): Promise<ThreadCommentRow[]> {
  const comments = await prisma.threadComment.findMany({
    where: { subjectType, subjectId },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const authors = Array.from(new Set(comments.map((c) => c.author)));
  const users = authors.length
    ? await prisma.user.findMany({
        where: { address: { in: authors, mode: "insensitive" } },
        select: { address: true, username: true, avatarUrl: true, verified: true },
      })
    : [];
  const byAddr = new Map(
    users.map((u) => [u.address.toLowerCase(), u] as const),
  );

  const { counts, likedByViewer } = await likeInfo(
    "thread",
    comments.map((c) => c.id),
    viewer,
  );

  return comments.map((c) => {
    const u = byAddr.get(c.author.toLowerCase());
    return {
      id: c.id,
      author: c.author,
      authorUsername: u?.username ?? null,
      authorAvatarUrl: u?.avatarUrl ?? null,
      authorVerified: u?.verified ?? false,
      body: c.body,
      gifUrl: c.gifUrl ?? null,
      parentId: c.parentId ?? null,
      likes: counts.get(c.id) ?? 0,
      likedByMe: likedByViewer.has(c.id),
      createdAt: c.createdAt.toISOString(),
    };
  });
}
