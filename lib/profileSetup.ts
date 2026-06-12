/** First-time profile customization after Privy sign-up. */
export const PROFILE_SETUP_PATH = "/profile/setup";

/** Routes reachable before a username is set. */
export const PROFILE_SETUP_EXEMPT_PREFIXES = [
  PROFILE_SETUP_PATH,
  "/",
  "/onboarding",
  "/maintenance",
  "/terms",
  "/privacy",
] as const;

export function isProfileSetupExemptPath(pathname: string): boolean {
  return PROFILE_SETUP_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
