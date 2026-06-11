/** Set when the user finishes or skips the onboarding card flow. */
export const ONBOARDING_ENTERED_KEY = "sb_has_entered";

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
