"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { REFERRAL_STORAGE_KEY } from "@/lib/referrals";
import { jsonFetch } from "@/lib/fetcher";

/** After sign-in, attach a cached referral code to the connected wallet once. */
export function ReferralAttribution() {
  const { authenticated, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !address) return;
    const key = address.toLowerCase();
    if (attempted.current === key) return;

    let slug: string | null = null;
    try {
      slug = localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      return;
    }
    if (!slug?.trim()) return;

    attempted.current = key;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        await jsonFetch("/api/referrals/attribution", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug: slug.trim(), address }),
        });
      } catch {
        /* best-effort */
      }
    })();
  }, [authenticated, address, getAccessToken]);

  return null;
}
