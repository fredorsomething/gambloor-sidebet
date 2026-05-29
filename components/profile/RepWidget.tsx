"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useAccount } from "wagmi";

import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import type { RepSummary } from "@/lib/rep";
import { cn } from "@/lib/utils";

export function RepWidget({ target }: { target: string }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { address: voter } = useAccount();
  const { push } = useToast();
  const qc = useQueryClient();

  const isSelf = !!voter && voter.toLowerCase() === target.toLowerCase();
  const key = ["rep", target.toLowerCase(), voter?.toLowerCase() ?? null];

  const { data } = useQuery<RepSummary>({
    queryKey: key,
    queryFn: () =>
      jsonFetch(
        `/api/rep?target=${target}${voter ? `&voter=${voter}` : ""}`,
      ),
    staleTime: 15_000,
  });

  const vote = useMutation({
    mutationFn: async (value: 1 | -1 | 0) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<RepSummary>("/api/rep", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ voter, target, value }),
      });
    },
    onSuccess: (summary) => {
      qc.setQueryData(key, summary);
    },
    onError: (err) => {
      push({ title: (err as Error)?.message || "Vote failed", variant: "danger" });
    },
  });

  const score = data?.score ?? 0;
  const myVote = data?.myVote ?? 0;

  function cast(next: 1 | -1) {
    if (!authenticated || !voter) {
      void login();
      return;
    }
    if (isSelf) return;
    // Clicking your current vote again clears it (toggle to neutral).
    vote.mutate(myVote === next ? 0 : next);
  }

  const disabled = isSelf || vote.isPending;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1",
          isSelf && "opacity-60",
        )}
      >
        <button
          type="button"
          onClick={() => cast(1)}
          disabled={disabled}
          aria-label="Give rep"
          title={isSelf ? "You can't vote on yourself" : "Give rep"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed",
            myVote === 1
              ? "bg-success/20 text-success"
              : "text-success hover:bg-success/10",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
        </button>

        <span className="min-w-[2.5rem] text-center text-lg font-bold tabular-nums text-foreground">
          {score}
        </span>

        <button
          type="button"
          onClick={() => cast(-1)}
          disabled={disabled}
          aria-label="Remove rep"
          title={isSelf ? "You can't vote on yourself" : "Downvote"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed",
            myVote === -1
              ? "bg-danger/20 text-danger"
              : "text-danger hover:bg-danger/10",
          )}
        >
          <Minus className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Reputation
      </span>
    </div>
  );
}
