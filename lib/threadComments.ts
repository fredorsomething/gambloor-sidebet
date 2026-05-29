import { prisma } from "@/lib/db";

export type SubjectType = "bet" | "market";

export type ThreadCommentRow = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
};

/**
 * List comments on a sidebet or market thread, newest first, joined with the
 * author's profile (username + avatar) for display.
 */
export async function listThreadComments(
  subjectType: SubjectType,
  subjectId: number,
): Promise<ThreadCommentRow[]> {
  const comments = await prisma.threadComment.findMany({
    where: { subjectType, subjectId },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const authors = Array.from(new Set(comments.map((c) => c.author)));
  const users = authors.length
    ? await prisma.user.findMany({
        where: { address: { in: authors, mode: "insensitive" } },
        select: { address: true, username: true, avatarUrl: true },
      })
    : [];
  const byAddr = new Map(
    users.map((u) => [u.address.toLowerCase(), u] as const),
  );

  return comments.map((c) => {
    const u = byAddr.get(c.author.toLowerCase());
    return {
      id: c.id,
      author: c.author,
      authorUsername: u?.username ?? null,
      authorAvatarUrl: u?.avatarUrl ?? null,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    };
  });
}
