"use client";

import { useQuery } from "@tanstack/react-query";

import { jsonFetch } from "@/lib/fetcher";

export type PublicProfile = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

export type ResolveResponse = Record<string, PublicProfile>;

/** Resolves a batch of addresses to public profiles (react-query de-dupes). */
export function useProfile(address?: string | null) {
  const lower = address?.toLowerCase();
  return useQuery<PublicProfile | null>({
    queryKey: ["profile", lower],
    enabled: !!lower,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await jsonFetch<ResolveResponse>(
        `/api/users/resolve?addresses=${lower}`,
      );
      return res[lower!] ?? null;
    },
  });
}
