"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { BetActions } from "@/components/BetActions";
import { BetNegotiations } from "@/components/BetNegotiations";
import { ReviseBetEscrow } from "@/components/ReviseBetEscrow";
import { isAdminAddress } from "@/lib/admin";
import { betDetailPollInterval, resolveBetStatus } from "@/lib/betStatus";
import { jsonFetch } from "@/lib/fetcher";
import type { GetBetResponse } from "@/lib/types";

const AUTO_SETTLE_RETRY_MS = 15_000;

/**
 * Polls the bet endpoint so the action UI always reflects the latest on-chain
 * status (via the API's opportunistic sync) without a full reload.
 */
export function BetDetailLive({
  id,
  initial,
}: {
  id: number;
  initial: GetBetResponse;
}) {
  const qc = useQueryClient();
  const q = useQuery<GetBetResponse>({
    queryKey: ["bet", id],
    queryFn: () => jsonFetch(`/api/bets/${id}`),
    initialData: initial,
    refetchInterval: (query) => {
      const d = query.state.data ?? initial;
      return betDetailPollInterval(d.bet, d.onchain);
    },
  });

  const data = q.data ?? initial;
  const autoSettleBusy = useRef(false);
  const { refetch } = q;

  useEffect(() => {
    const status = resolveBetStatus(data.bet, data.onchain);
    const res = data.resolution;
    const shouldRetry =
      status === "Matched" &&
      isAdminAddress(data.bet.settler) &&
      data.autoSettleStatus?.platformReady !== false &&
      ((res?.consensus === "unanimous" && res.agreedOutcome != null) ||
        res?.verifiedOutcome != null);

    if (!shouldRetry) return;

    const attempt = () => {
      if (autoSettleBusy.current) return;
      autoSettleBusy.current = true;
      jsonFetch(`/api/bets/${id}/auto-settle`, { method: "POST" })
        .then(() => {
          void refetch();
        })
        .catch(() => {
          /* GET poll + cron also retry */
        })
        .finally(() => {
          autoSettleBusy.current = false;
        });
    };

    attempt();
    const timer = window.setInterval(attempt, AUTO_SETTLE_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [
    data.autoSettleStatus?.platformReady,
    data.bet,
    data.onchain,
    data.resolution?.consensus,
    data.resolution?.agreedOutcome,
    data.resolution?.verifiedOutcome,
    id,
    refetch,
  ]);

  function onBetUpdated() {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["feed", "bets"] });
    void qc.invalidateQueries({ queryKey: ["feed"] });
  }

  return (
    <div className="space-y-4">
      <ReviseBetEscrow
        bet={data.bet}
        onchain={data.onchain}
        onDone={onBetUpdated}
      />
      <BetActions
        bet={data.bet}
        onchain={data.onchain}
        resolution={data.resolution}
        autoSettleStatus={data.autoSettleStatus}
        onTxConfirmed={onBetUpdated}
      />
      {resolveBetStatus(data.bet, data.onchain) === "Open" && (
        <BetNegotiations bet={data.bet} />
      )}
    </div>
  );
}
