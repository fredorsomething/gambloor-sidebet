/** Set when the user finishes or skips the onboarding card flow. */
export const ONBOARDING_ENTERED_KEY = "sb_has_entered";

/** One-shot flag: open Privy after landing on home post-onboarding. */
export const POST_ONBOARDING_LOGIN_KEY = "sb_prompt_login";

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_ENTERED_KEY, "1");
  } catch {
    /* ignore */
  }
}
