import { prisma } from "@/lib/db";

/** True if either party has blocked the other. */
export async function isDmBlocked(a: string, b: string): Promise<boolean> {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const row = await prisma.dmBlock.findFirst({
    where: {
      OR: [
        { blocker: x, blocked: y },
        { blocker: y, blocked: x },
      ],
    },
  });
  return !!row;
}

/** Addresses the user has blocked (lowercase). */
export async function blockedByUser(blocker: string): Promise<Set<string>> {
  const rows = await prisma.dmBlock.findMany({
    where: { blocker: blocker.toLowerCase() },
    select: { blocked: true },
  });
  return new Set(rows.map((r) => r.blocked));
}

/** Addresses who blocked this user (lowercase). */
export async function usersWhoBlocked(blocked: string): Promise<Set<string>> {
  const rows = await prisma.dmBlock.findMany({
    where: { blocked: blocked.toLowerCase() },
    select: { blocker: true },
  });
  return new Set(rows.map((r) => r.blocker));
}
