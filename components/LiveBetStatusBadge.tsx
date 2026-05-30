"use client";

import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/ui/badge";
import type { BetStatusName } from "@/lib/abi";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

/**
 * Status badge that stays in sync with the live bet state. Shares the
 * ["bet", id] react-query cache with BetDetailLive, so once a match/settle is
 * picked up by the polling sync the badge updates without a page reload.
 */
export function LiveBetStatusBadge({
  id,
  initialStatus,
}: {
  id: number;
  initialStatus: BetStatusName;
}) {
  const { data } = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    refetchInterval: 5_000,
  });
  return <StatusBadge status={data?.bet.status ?? initialStatus} />;
}
