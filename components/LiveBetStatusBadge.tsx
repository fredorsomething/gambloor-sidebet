"use client";

import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/ui/badge";
import type { BetStatusName } from "@/lib/abi";
import {
  betDetailPollInterval,
  betIsTerminal,
  resolveBetStatus,
} from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

/**
 * Status badge that stays in sync with the live bet state. Uses on-chain
 * acceptor/status (via resolveBetStatus) so "Open" never sticks after a match.
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
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.bet) return betDetailPollInterval(d.bet, d.onchain);
      return betIsTerminal(initialStatus) ? false : 3_000;
    },
  });

  const status = data
    ? resolveBetStatus(data.bet, data.onchain)
    : initialStatus;

  return <StatusBadge status={status} />;
}
