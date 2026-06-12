/** Cookie set after entering the maintenance password. */
export const MAINTENANCE_BYPASS_COOKIE = "sb_maint_bypass";

/** Cookie value when maintenance bypass is active. */
export const MAINTENANCE_BYPASS_VALUE = "1";

/** Site-wide maintenance password (override via env in production if needed). */
export const MAINTENANCE_PASSWORD =
  process.env.MAINTENANCE_PASSWORD?.trim() || "dog";

export function isMaintenanceBypassCookie(value: string | undefined): boolean {
  return value === MAINTENANCE_BYPASS_VALUE;
}

export function isMaintenancePassword(input: string): boolean {
  return input.trim() === MAINTENANCE_PASSWORD;
}

/** Paths reachable while maintenance mode is on (before password). */
export function isMaintenancePublicPath(pathname: string): boolean {
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/api/maintenance") ||
    pathname.startsWith("/api/platform/settings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  ) {
    return true;
  }
  return /\.[a-z0-9]+$/i.test(pathname);
}
