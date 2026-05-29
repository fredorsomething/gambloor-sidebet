import { prisma } from "@/lib/db";

export type ProfileCommentRow = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
};

/** List comments on a profile, newest first, joined with author profile info. */
export async function listProfileComments(
  target: string,
): Promise<ProfileCommentRow[]> {
  const comments = await prisma.profileComment.findMany({
    where: { target: target.toLowerCase() },
    orderBy: { createdAt: "desc" },
    take: 200,
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
