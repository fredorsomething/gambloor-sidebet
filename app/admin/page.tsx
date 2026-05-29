"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gavel, ShieldCheck, Store, X } from "lucide-react";
import Link from "next/link";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { isAdminAddress } from "@/lib/admin";
import { jsonFetch } from "@/lib/fetcher";
import type { ListMarketsResponse, MarketRow } from "@/lib/types";
import { shortAddr } from "@/lib/utils";

type ResolutionItem = {
  id: number;
  subjectType: "bet" | "market";
  subjectId: number;
  proposedBy: string;
  proposedOutcome: number;
  note: string | null;
  createdAt: string;
  subjectTitle: string;
  subjectLink: string | null;
  outcomeLabel: string;
};

export default function AdminPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();

  if (!ready) {
    return <div className="card h-40 animate-pulse rounded-2xl bg-muted/40" />;
  }

  if (!authenticated || !address || !isAdminAddress(address)) {
    return (
      <div className="card p-10 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Admin only</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This dashboard is restricted to the platform admin.
        </p>
      </div>
    );
  }

  return <AdminDashboard address={address} />;
}

function AdminDashboard({ address }: { address: string }) {
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const marketsQ = useQuery<ListMarketsResponse>({
    queryKey: ["admin", "pendingMarkets"],
    queryFn: () => jsonFetch(`/api/markets?status=Pending&take=100`),
    refetchInterval: 20_000,
  });

  const resolutionsQ = useQuery<{ proposals: ResolutionItem[] }>({
    queryKey: ["admin", "pendingResolutions"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { proposals: [] };
      return jsonFetch(`/api/resolutions?address=${address}&status=Pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  });

  const reviewMarket = useMutation({
    mutationFn: async (v: { id: number; action: "approve" | "reject" }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expired");
      return jsonFetch(`/api/markets/${v.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, action: v.action }),
      });
    },
    onSuccess: (_d, v) => {
      push({
        title: v.action === "approve" ? "Market approved" : "Market rejected",
        variant: "success",
      });
      void qc.invalidateQueries({ queryKey: ["admin", "pendingMarkets"] });
    },
    onError: (e) =>
      push({ title: (e as Error).message || "Action failed", variant: "danger" }),
  });

  const reviewResolution = useMutation({
    mutationFn: async (v: { id: number; action: "approve" | "reject" }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expired");
      return jsonFetch(`/api/resolutions/${v.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, action: v.action }),
      });
    },
    onSuccess: (_d, v) => {
      push({
        title: v.action === "approve" ? "Resolution verified" : "Resolution rejected",
        variant: "success",
      });
      void qc.invalidateQueries({ queryKey: ["admin", "pendingResolutions"] });
    },
    onError: (e) =>
      push({ title: (e as Error).message || "Action failed", variant: "danger" }),
  });

  const markets = marketsQ.data?.items ?? [];
  const resolutions = resolutionsQ.data?.proposals ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-danger" />
          Admin dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve new markets and verify proposed resolutions.
        </p>
      </div>

      {/* Markets awaiting approval */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">
            Markets awaiting approval
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({markets.length})
            </span>
          </h2>
        </div>

        {markets.length === 0 ? (
          <div className="card p-6 text-sm text-muted-foreground">
            No markets are waiting for approval.
          </div>
        ) : (
          <div className="space-y-2">
            {markets.map((m: MarketRow) => (
              <div key={m.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/markets/${m.id}`}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {m.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {m.outcomes.map((o) => o.label).join(" · ")}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    by {shortAddr(m.creator)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => reviewMarket.mutate({ id: m.id, action: "approve" })}
                    disabled={reviewMarket.isPending}
                    className="gap-1"
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => reviewMarket.mutate({ id: m.id, action: "reject" })}
                    disabled={reviewMarket.isPending}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Resolutions awaiting verification */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">
            Resolutions to verify
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({resolutions.length})
            </span>
          </h2>
        </div>

        {resolutions.length === 0 ? (
          <div className="card p-6 text-sm text-muted-foreground">
            No resolutions are waiting for review.
          </div>
        ) : (
          <div className="space-y-2">
            {resolutions.map((r) => (
              <div key={r.id} className="card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {r.subjectType}
                  </span>
                  {r.subjectLink ? (
                    <Link
                      href={r.subjectLink}
                      className="font-medium hover:text-primary"
                    >
                      {r.subjectTitle}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.subjectTitle}</span>
                  )}
                </div>
                <div className="text-sm">
                  Proposed outcome:{" "}
                  <span className="font-semibold text-success">
                    {r.outcomeLabel}
                  </span>
                </div>
                {r.note && (
                  <p className="rounded-lg bg-muted/40 p-2.5 text-sm text-muted-foreground">
                    {r.note}
                  </p>
                )}
                <p className="font-mono text-[11px] text-muted-foreground">
                  proposed by {shortAddr(r.proposedBy)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => reviewResolution.mutate({ id: r.id, action: "approve" })}
                    disabled={reviewResolution.isPending}
                    className="gap-1"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Verify outcome
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => reviewResolution.mutate({ id: r.id, action: "reject" })}
                    disabled={reviewResolution.isPending}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
