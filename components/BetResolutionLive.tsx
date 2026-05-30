"use client";

import { useQuery } from "@tanstack/react-query";

import { BetResolutionPanel } from "@/components/BetResolutionPanel";
import { betAcceptor, betDetailPollInterval, resolveBetStatus } from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

/** Resolution UI driven by live bet sync (acceptor + status from chain). */
export function BetResolutionLive({
  id,
  initial,
}: {
  id: number;
  initial: GetBetResponse;
}) {
  const { data } = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: (query) => {
      const d = query.state.data ?? initial;
      return betDetailPollInterval(d.bet, d.onchain);
    },
  });

  const payload = data ?? initial;
  const { bet, onchain } = payload;
  const acceptor = betAcceptor(bet, onchain);
  const status = resolveBetStatus(bet, onchain);
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];

  if (status === "Cancelled" || status === "Refunded") return null;

  return (
    <BetResolutionPanel
      betId={bet.id}
      outcomes={outcomes}
      proposer={bet.proposer}
      acceptor={acceptor}
      settled={status === "Settled"}
    />
  );
}
