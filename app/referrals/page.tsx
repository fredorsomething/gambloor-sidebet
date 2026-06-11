"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Check, Copy, Gift, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { jsonFetch } from "@/lib/fetcher";
import { getSiteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type Campaign = {
  id: number;
  slug: string;
  label: string | null;
  link: string;
  referralCount: number;
  earnedUsd: number;
  feesGeneratedUsd: number;
  createdAt: string;
};

type ReferralRow = {
  campaignId: number;
  campaignSlug: string;
  referred: string;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  volumeUsd: number;
  feesPaidUsd: number;
};

type Dashboard = {
  sharePercent: number;
  maxCampaigns: number;
  pendingUsd: number;
  collectedUsd: number;
  campaigns: Campaign[];
  referrals: ReferralRow[];
};

function usd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ReferralsPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ["referrals", address?.toLowerCase()],
    enabled: !!address && authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in required");
      return jsonFetch(
        `/api/referrals?address=${encodeURIComponent(address!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    },
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in required");
      return jsonFetch("/api/referrals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, slug, label: label.trim() || null }),
      });
    },
    onSuccess: () => {
      setSlug("");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["referrals", address?.toLowerCase()] });
    },
  });

  const collect = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in required");
      return jsonFetch<{ collectedUsd: number }>("/api/referrals", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referrals", address?.toLowerCase()] });
    },
  });

  if (!ready || !authenticated || !address) {
    return (
      <div className="card mx-auto max-w-lg space-y-4 p-8 text-center">
        <Gift className="mx-auto h-10 w-10 text-primary" />
        <h1 className="text-xl font-semibold">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to create referral links and earn {35}% of proceeds from users you
          bring to Sidebet.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  const site = getSiteUrl().replace(/\/$/, "");
  const canCreate = (data?.campaigns.length ?? 0) < (data?.maxCampaigns ?? 3);

  function copyLink(slugValue: string) {
    const url = `${site}/?r=${encodeURIComponent(slugValue)}`;
    navigator.clipboard?.writeText(url);
    setCopied(slugValue);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Create up to {data?.maxCampaigns ?? 3} campaigns with unique links like{" "}
          <span className="font-mono text-foreground">sidebet.lol/?r=yourname</span>.
          Earn {data?.sharePercent ?? 35}% of all platform fees from users you refer.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending" value={usd(data?.pendingUsd ?? 0)} tone="success" />
        <StatCard label="Collected" value={usd(data?.collectedUsd ?? 0)} />
        <StatCard
          label="Referrals"
          value={String(data?.referrals.length ?? 0)}
        />
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Collect earnings</h2>
            <p className="text-sm text-muted-foreground">
              Pending rewards are credited to your Sidebet balance (USDC.e).
            </p>
          </div>
          <Button
            onClick={() => collect.mutate()}
            disabled={
              collect.isPending || !data || data.pendingUsd <= 0
            }
          >
            {collect.isPending
              ? "Collecting…"
              : `Collect ${usd(data?.pendingUsd ?? 0)}`}
          </Button>
        </div>
        {collect.isError && (
          <p className="text-sm text-danger">
            {(collect.error as Error).message || "Collection failed"}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your campaigns</h2>
          <span className="text-xs text-muted-foreground">
            {data?.campaigns.length ?? 0} / {data?.maxCampaigns ?? 3}
          </span>
        </div>

        {isLoading && (
          <div className="card h-24 animate-pulse bg-muted/30" />
        )}

        {!isLoading && (data?.campaigns.length ?? 0) === 0 && (
          <div className="card p-6 text-sm text-muted-foreground">
            No campaigns yet — create your first referral link below.
          </div>
        )}

        <div className="space-y-2">
          {data?.campaigns.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {c.label || c.slug}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">
                      ?r={c.slug}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {site}/?r={c.slug}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{c.referralCount} sign-ups</span>
                    <span>{usd(c.earnedUsd)} earned</span>
                    <span>{usd(c.feesGeneratedUsd)} fees generated</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyLink(c.slug)}
                >
                  {copied === c.slug ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {canCreate && (
          <div className="card space-y-3 p-4">
            <h3 className="text-sm font-semibold">New campaign</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 block">
                <span className="label">Referral code</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">?r=</span>
                  <input
                    className="input font-mono"
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    placeholder="yourname"
                    maxLength={32}
                  />
                </div>
              </label>
              <label className="space-y-1 block">
                <span className="label">Label (optional)</span>
                <input
                  className="input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Twitter promo"
                  maxLength={60}
                />
              </label>
            </div>
            {createCampaign.isError && (
              <p className="text-sm text-danger">
                {(createCampaign.error as Error).message || "Could not create campaign"}
              </p>
            )}
            <Button
              onClick={() => createCampaign.mutate()}
              disabled={createCampaign.isPending || slug.trim().length < 3}
            >
              {createCampaign.isPending ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          Referred users
        </h2>
        {!data?.referrals.length ? (
          <div className="card p-6 text-sm text-muted-foreground">
            Share your link — referred users will show up here with their volume and
            fees.
          </div>
        ) : (
          <div className="space-y-2">
            {data.referrals.map((r) => (
              <div
                key={`${r.campaignId}-${r.referred}`}
                className="card flex flex-wrap items-center gap-3 p-4"
              >
                <Avatar address={r.referred} url={r.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <UserNameWithBadge
                    name={
                      r.username
                        ? `@${r.username}`
                        : `${r.referred.slice(0, 6)}…${r.referred.slice(-4)}`
                    }
                    className="text-sm font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    via <span className="font-mono">?r={r.campaignSlug}</span> ·{" "}
                    {new Date(r.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold tabular-nums">{usd(r.volumeUsd)} vol</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {usd(r.feesPaidUsd)} fees
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Referral links work on any page — add{" "}
        <span className="font-mono">?r=code</span> to the URL. The code is saved when
        someone visits, and credited when they sign up.{" "}
        <Link href="/how-it-works" className="text-primary hover:underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "success" | "neutral";
}) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
    </div>
  );
}
