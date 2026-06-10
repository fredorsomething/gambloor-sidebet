import { isAdminAddress } from "@/lib/admin";

export type BadgeKind =
  | "User"
  | "Admin"
  | "Staff"
  | "Trusted"
  | "Resolver"
  | "OG"
  | "Supporter";

/** Badges an admin can assign (Admin is always derived from the admin wallet). */
export const ASSIGNABLE_BADGES: BadgeKind[] = [
  "User",
  "Staff",
  "Trusted",
  "Resolver",
];

const PERSISTABLE_BADGES: BadgeKind[] = [
  ...ASSIGNABLE_BADGES,
  "OG",
  "Supporter",
];

const DISPLAY_ORDER: BadgeKind[] = [
  "Admin",
  "Staff",
  "Resolver",
  "Trusted",
  "OG",
  "Supporter",
  "User",
];

/** Stored badge list → display order, always includes User; Admin if admin wallet. */
export function resolveDisplayBadges(
  stored: string[] | null | undefined,
  address: string,
): BadgeKind[] {
  const set = new Set<BadgeKind>(["User"]);
  if (isAdminAddress(address)) set.add("Admin");
  for (const raw of stored ?? []) {
    if (
      PERSISTABLE_BADGES.includes(raw as BadgeKind) &&
      raw !== "User"
    ) {
      set.add(raw as BadgeKind);
    }
  }
  return DISPLAY_ORDER.filter((b) => set.has(b));
}

/** Sanitize admin PATCH input before persisting on User.badges. */
export function sanitizeStoredBadges(input: string[] | undefined): string[] {
  const set = new Set<string>(["User"]);
  if (!input) return ["User"];
  for (const raw of input) {
    if (PERSISTABLE_BADGES.includes(raw as BadgeKind) && raw !== "User") {
      set.add(raw);
    }
  }
  return DISPLAY_ORDER.filter((b) => set.has(b)) as string[];
}
