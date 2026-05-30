"use client";

import { useQuery } from "@tanstack/react-query";

import { jsonFetch } from "@/lib/fetcher";

export type PlatformSettingsPublic = {
  allowMarketCreation: boolean;
  updatedAt: string;
};

export function usePlatformSettings() {
  return useQuery<PlatformSettingsPublic>({
    queryKey: ["platform-settings"],
    queryFn: () => jsonFetch("/api/platform/settings"),
    staleTime: 60_000,
  });
}
