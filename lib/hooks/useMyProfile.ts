"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";

import { jsonFetch } from "@/lib/fetcher";
import type { PublicProfile } from "@/lib/hooks/useProfile";

/** Profile for the signed-in user (Privy-aware, server resolves wallet). */
export function useMyProfile() {
  const { authenticated, getAccessToken } = usePrivy();

  return useQuery<PublicProfile | null>({
    queryKey: ["profile", "me"],
    enabled: authenticated,
    staleTime: 30_000,
    retry: 2,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return null;
      return jsonFetch<PublicProfile>("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  });
}
