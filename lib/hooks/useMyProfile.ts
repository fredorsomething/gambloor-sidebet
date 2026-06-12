"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";

import { jsonFetch } from "@/lib/fetcher";
import type { PublicProfile } from "@/lib/hooks/useProfile";

/** Profile for the signed-in user on their active wallet (Privy-aware). */
export function useMyProfile(address?: string | null) {
  const { authenticated, getAccessToken } = usePrivy();
  const lower = address?.toLowerCase();

  return useQuery<PublicProfile | null>({
    queryKey: ["profile", "me", lower],
    enabled: !!lower && authenticated,
    staleTime: 30_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return null;
      return jsonFetch<PublicProfile>(`/api/users/me?address=${lower}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  });
}
