"use client";

import { useQuery } from "@tanstack/react-query";

import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

/**
 * Polls the bet endpoint so client-side action UIs always reflect the latest
 * on-chain status (via the API's opportunistic sync) without a full reload.
 */
export function BetDetailLive({
  id,
  initial,
  children,
}: {
  id: number;
  initial: GetBetResponse;
  children: (data: GetBetResponse) => React.ReactNode;
}) {
  const q = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: 10_000,
  });

  return <>{children(q.data ?? initial)}</>;
}
