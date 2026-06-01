"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { REFERRAL_STORAGE_KEY } from "@/lib/referrals";

/** Persist ?r= referral codes from any page load into localStorage. */
export function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const r = searchParams.get("r")?.trim();
    if (!r) return;
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, r.toLowerCase());
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  return null;
}
