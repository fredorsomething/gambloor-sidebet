import { prisma } from "@/lib/db";

// Re-record a repeat view from the same viewer at most once per this window.
const VIEW_DEDUPE_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Total profile views (distinct viewers) for a target address (lowercased). */
export async function getProfileViewCount(target: string): Promise<number> {
  return prisma.profileView.count({
    where: { target: target.toLowerCase() },
  });
}

/**
 * Record a profile view. `viewer` is a lowercased wallet address or an
 * "anon:<id>" key for signed-out visitors. Self-views are ignored. Repeat views
 * from the same viewer only bump `updatedAt` (count stays distinct-viewer based).
 * Returns the up-to-date total view count.
 */
export async function recordProfileView(
  target: string,
  viewer: string,
): Promise<number> {
  const t = target.toLowerCase();
  const v = viewer.toLowerCase();

  // Never count someone viewing their own profile.
  if (t === v) return getProfileViewCount(t);

  const existing = await prisma.profileView.findUnique({
    where: { target_viewer: { target: t, viewer: v } },
  });

  if (!existing) {
    try {
      await prisma.profileView.create({ data: { target: t, viewer: v } });
    } catch {
      // Unique race: another request inserted it first — fine.
    }
  } else if (Date.now() - existing.updatedAt.getTime() > VIEW_DEDUPE_MS) {
    await prisma.profileView.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
  }

  return getProfileViewCount(t);
}
