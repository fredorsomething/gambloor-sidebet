"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { FlexCardDownload } from "@/components/FlexCardDownload";
import {
  betAcceptor,
  betDetailPollInterval,
  resolveBetStatus,
} from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

export function BetFlexCard({
  betId,
  initial,
}: {
  betId: number;
  initial: GetBetResponse;
}) {
  const { address } = useAccount();

  const { data } = useQuery<GetBetResponse>({
    queryKey: ["bet", betId],
    queryFn: () => jsonFetch(`/api/bets/${betId}`),
    initialData: initial,
    refetchInterval: (query) => {
      const d = query.state.data ?? initial;
      return betDetailPollInterval(d.bet, d.onchain);
    },
  });

  const payload = data ?? initial;
  const { bet, onchain } = payload;
  const status = resolveBetStatus(bet, onchain);
  const settled = status === "Settled" || status === "Refunded";
  if (!settled || !address) return null;

  const lower = address.toLowerCase();
  const acceptor = betAcceptor(bet, onchain);
  const isParticipant =
    bet.proposer.toLowerCase() === lower ||
    (acceptor != null && acceptor.toLowerCase() === lower);
  if (!isParticipant) return null;

  return (
    <FlexCardDownload
      apiPath={`/api/bets/${betId}/flex-card`}
      account={address}
      filename={`sidebet-${betId}.png`}
    />
  );
}
