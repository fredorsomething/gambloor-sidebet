"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { multiOutcomeIndexTone } from "@/lib/outcomeTone";
import type { SentimentSummary } from "@/lib/sentimentHandlers";
import { cn } from "@/lib/utils";

function barSegmentClass(outcomes: string[], index: number): string {
  const tone = multiOutcomeIndexTone(outcomes, index);
  if (tone === "success") return "bg-success";
  if (tone === "danger") return "bg-danger";
  const extras = [
    "bg-primary",
    "bg-warning",
    "bg-[hsl(var(--accent))]",
    "bg-muted-foreground/70",
  ];
  return extras[(index - 2) % extras.length] ?? "bg-muted-foreground/50";
}

function chipClass(
  outcomes: string[],
  index: number,
  selected: boolean,
): string {
  const tone = multiOutcomeIndexTone(outcomes, index);
  if (selected) {
    if (tone === "success") return "border-success bg-success/20 text-success";
    if (tone === "danger") return "border-danger bg-danger/20 text-danger";
    return "border-primary bg-primary/15 text-primary";
  }
  if (tone === "success") return "border-success/30 bg-success/10 text-success";
  if (tone === "danger") return "border-danger/30 bg-danger/10 text-danger";
  return "border-border bg-muted/30 text-muted-foreground hover:border-primary/40";
}

type Props = {
  subjectType: "bet" | "market";
  subjectId: number;
  outcomes: string[];
  className?: string;
};

export function SentimentBar({
  subjectType,
  subjectId,
  outcomes,
  className,
}: Props) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { address } = useAccount();
  const { push } = useToast();
  const qc = useQueryClient();

  const apiBase = `/api/${subjectType === "bet" ? "bets" : "markets"}/${subjectId}/sentiment`;
  const queryKey = [
    "sentiment",
    subjectType,
    subjectId,
    address?.toLowerCase() ?? null,
  ];

  const { data, isLoading } = useQuery<SentimentSummary>({
    queryKey,
    queryFn: () =>
      jsonFetch(
        `${apiBase}${address ? `?viewer=${address}` : ""}`,
      ),
    staleTime: 15_000,
    enabled: outcomes.length >= 2,
  });

  const vote = useMutation({
    mutationFn: async (outcomeIndex: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<SentimentSummary>(apiBase, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ voter: address, outcomeIndex }),
      });
    },
    onSuccess: (summary) => {
      qc.setQueryData(queryKey, summary);
    },
    onError: (err) => {
      push({
        title: (err as Error)?.message || "Couldn't record vote",
        variant: "danger",
      });
    },
  });

  if (outcomes.length < 2) return null;

  const countsByIndex = new Map(
    (data?.counts ?? []).map((c) => [c.index, c.count]),
  );
  const totalVotes = data?.totalVotes ?? 0;
  const yourVote = data?.yourVote ?? null;

  function pick(index: number) {
    if (!authenticated || !address) {
      void login();
      return;
    }
    if (vote.isPending) return;
    vote.mutate(index);
  }

  const segments = outcomes.map((label, index) => {
    const count = countsByIndex.get(index) ?? 0;
    const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
    return { label, index, count, pct };
  });

  return (
    <section className={cn("card p-5 space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Community sentiment</h2>
        <span className="text-xs text-muted-foreground">
          {totalVotes === 0
            ? "No votes yet"
            : `${totalVotes} vote${totalVotes === 1 ? "" : "s"}`}
          {" · "}
          one per wallet
        </span>
      </div>

      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40"
        aria-hidden={totalVotes === 0}
      >
        {totalVotes > 0 ? (
          segments.map((s) =>
            s.pct > 0 ? (
              <div
                key={s.index}
                className={cn("h-full transition-all", barSegmentClass(outcomes, s.index))}
                style={{ width: `${s.pct}%` }}
                title={`${s.label}: ${Math.round(s.pct)}%`}
              />
            ) : null,
          )
        ) : (
          <div className="h-full w-full bg-muted/30" />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {segments.map((s) => {
          const selected = yourVote === s.index;
          const pctLabel =
            totalVotes > 0 ? `${Math.round(s.pct)}%` : "—";
          return (
            <button
              key={s.index}
              type="button"
              disabled={isLoading || vote.isPending}
              onClick={() => pick(s.index)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                chipClass(outcomes, s.index, selected),
                selected && "ring-1 ring-offset-1 ring-offset-background",
              )}
              aria-pressed={selected}
            >
              {s.label}
              <span className="ml-1.5 tabular-nums opacity-80">
                {pctLabel}
                {s.count > 0 && (
                  <span className="hidden sm:inline">
                    {" "}
                    · {s.count}
                  </span>
                )}
              </span>
              {selected && (
                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                  you
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Tap an outcome to share where you think this is heading. Sentiment is
        social only — it doesn&apos;t affect stakes or trades.
      </p>
    </section>
  );
}
