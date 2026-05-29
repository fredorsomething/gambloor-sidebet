"use client";

import { useQuery } from "@tanstack/react-query";

import { BetActions } from "@/components/BetActions";
import { BetNegotiations } from "@/components/BetNegotiations";
import { ReviseBetEscrow } from "@/components/ReviseBetEscrow";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

/**
 * Polls the bet endpoint so the action UI always reflects the latest on-chain
 * status (via the API's opportunistic sync) without a full reload.
 *
 * Renders BetActions directly rather than via a render-prop, because this is
 * mounted from a Server Component and functions cannot cross the RSC boundary.
 */
export function BetDetailLive({
  id,
  initial,
}: {
  id: number;
  initial: GetBetResponse;
}) {
  const q = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: 5_000,
  });

  const data = q.data ?? initial;
  return (
    <div className="space-y-4">
      <ReviseBetEscrow
        bet={data.bet}
        onchain={data.onchain}
        onDone={() => void q.refetch()}
      />
      <BetActions
        bet={data.bet}
        onchain={data.onchain}
        onTxConfirmed={() => void q.refetch()}
      />
      {data.bet.status === "Open" && <BetNegotiations bet={data.bet} />}
    </div>
  );
}
