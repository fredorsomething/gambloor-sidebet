"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

import { POST_ONBOARDING_LOGIN_KEY } from "@/lib/onboarding";

/** Opens Privy once after the user finishes onboarding cards and lands on home. */
export function PostOnboardingLoginPrompt() {
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (!ready || authenticated) return;

    let shouldPrompt = false;
    try {
      shouldPrompt = sessionStorage.getItem(POST_ONBOARDING_LOGIN_KEY) === "1";
      if (shouldPrompt) sessionStorage.removeItem(POST_ONBOARDING_LOGIN_KEY);
    } catch {
      return;
    }
    if (!shouldPrompt) return;

    const t = window.setTimeout(() => {
      try {
        void login();
      } catch {
        /* dismissed or failed — user stays on home */
      }
    }, 450);

    return () => window.clearTimeout(t);
  }, [ready, authenticated, login]);

  return null;
}
