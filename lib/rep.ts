import { prisma } from "@/lib/db";

export type RepSummary = {
  score: number;
  up: number;
  down: number;
  myVote: number; // 1, -1, or 0
};

/** Aggregate reputation for a target, optionally including the viewer's vote. */
export async function getRepSummary(
  target: string,
  voter?: string | null,
): Promise<RepSummary> {
  const t = target.toLowerCase();
  const [up, down, mine] = await Promise.all([
    prisma.repVote.count({ where: { target: t, value: 1 } }),
    prisma.repVote.count({ where: { target: t, value: -1 } }),
    voter
      ? prisma.repVote.findUnique({
          where: { voter_target: { voter: voter.toLowerCase(), target: t } },
        })
      : Promise.resolve(null),
  ]);

  return { score: up - down, up, down, myVote: mine?.value ?? 0 };
}
