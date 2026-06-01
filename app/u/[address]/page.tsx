"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Copy, Eye, Mail } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { PnlChart } from "@/components/profile/PnlChart";
import { ProfileBalances } from "@/components/profile/ProfileBalances";
import { ProfileActivity } from "@/components/profile/ProfileActivity";
import { ProfileBadgesCosmetics } from "@/components/profile/ProfileBadgesCosmetics";
import { ProfileComments } from "@/components/profile/ProfileComments";
import { ProfileSocialLinks } from "@/components/profile/ProfileSocialLinks";
import { RepWidget } from "@/components/profile/RepWidget";
import { TipButton } from "@/components/profile/TipButton";
import { UserBadges } from "@/components/profile/UserBadges";
import { StatusBadge } from "@/components/ui/badge";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";
import { isAdminUser } from "@/lib/admin";
import { cn, formatToken, shortAddr } from "@/lib/utils";
import type { BadgeKind } from "@/lib/badges";
import { sidebetPnlDelta, type UserStats } from "@/lib/stats";
import type { BetStatusName } from "@/lib/abi";

type ProfileBet = {
  id: number;
  title: string;
  imageUrl: string | null;
  amount: string;
  proposerStake?: string | null;
  acceptorStake?: string | null;
  decimals: number;
  tokenSymbol: string | null;
  feeBps: number;
  proposer: string;
  acceptor: string | null;
  winner: string | null;
  status: BetStatusName;
};

type ProfileMarket = {
  id: number;
  title: string;
  imageUrl: string | null;
  status: string;
  tokenSymbol: string | null;
  feeBps: number;
  outcomeCount: number;
};

type ProfileResponse = {
  user: {
    address: string;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    twitter: string | null;
    discord: string | null;
    verified: boolean;
    badges: string[];
    joinedAt: string | null;
    views: number;
  };
  stats: UserStats;
  bets: ProfileBet[];
  markets: ProfileMarket[];
};

/** Stable per-browser anonymous id used to dedupe profile views. */
function getAnonViewerKey(): string {
  if (typeof window === "undefined") return "anon:server";
  try {
    let id = localStorage.getItem("sb_anon_id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("sb_anon_id", id);
    }
    return `anon:${id}`;
  } catch {
    return "anon:nostorage";
  }
}

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function joinedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function ProfilePage() {
  const params = useParams<{ address: string }>();
  const searchParams = useSearchParams();
  const handle = params.address;
  const { address: connected } = useAccount();

  const { data, isLoading, isError } = useQuery<ProfileResponse>({
    queryKey: ["userPage", handle?.toLowerCase()],
    enabled: !!handle,
    retry: false,
    queryFn: () => jsonFetch(`/api/users/${encodeURIComponent(handle)}`),
  });

  // Canonical wallet address (handle may have been an @username).
  const address = data?.user.address;

  // Record a profile view once per resolved profile load.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!address) return;
    if (recorded.current === address.toLowerCase()) return;
    recorded.current = address.toLowerCase();
    const viewer = connected ?? getAnonViewerKey();
    fetch(`/api/users/${address}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewer }),
    }).catch(() => {});
  }, [address, connected]);

  if (isError) {
    return (
      <div className="card p-10 text-center text-muted-foreground">
        User not found.
      </div>
    );
  }

  if (!address) {
    return (
      <div className="card h-40 animate-pulse rounded-2xl bg-muted/40" />
    );
  }

  const isMe = eq(connected, address);
  const openBadgesModal = isMe && searchParams.get("badges") === "1";
  const isAdmin = isAdminUser({ address, username: data?.user.username });
  const stats = data?.stats;

  const won =
    data?.bets.filter(
      (b) => b.status === "Settled" && eq(b.winner, address),
    ) ?? [];
  const lost =
    data?.bets.filter(
      (b) =>
        b.status === "Settled" &&
        b.winner &&
        !eq(b.winner, address) &&
        (eq(b.proposer, address) || eq(b.acceptor, address)),
    ) ?? [];

  // Sidebets this user proposed + CLOB markets they created.
  const createdBets = data?.bets.filter((b) => eq(b.proposer, address)) ?? [];
  const createdMarkets = data?.markets ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              address={address}
              url={data?.user.avatarUrl}
              size={72}
              className="ring-2 ring-card"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">
                <UserNameWithBadge
                  verified={data?.user.verified}
                  badgeSize={20}
                  name={
                    data?.user.username
                      ? `@${data.user.username}`
                      : shortAddr(address)
                  }
                />
              </h1>
              <CopyAddress address={address} />
              {data?.user.bio && (
                <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                  {data.user.bio}
                </p>
              )}
              <ProfileSocialLinks
                twitter={data?.user.twitter}
                discord={data?.user.discord}
                className="mt-2"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {joinedLabel(data?.user.joinedAt) && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Joined {joinedLabel(data?.user.joinedAt)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {(data?.user.views ?? 0).toLocaleString()}{" "}
                  {data?.user.views === 1 ? "view" : "views"}
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <UserBadges badges={(data?.user.badges ?? ["User"]) as BadgeKind[]} />
            {isMe && (
              <ProfileBadgesCosmetics
                address={address}
                badges={(data?.user.badges ?? ["User"]) as BadgeKind[]}
                defaultOpen={openBadgesModal}
              />
            )}
          </div>

          {/* Reputation + actions */}
          <div className="flex flex-col items-center gap-3 lg:items-end">
            {!isAdmin && <RepWidget target={address} />}
            <div className="flex gap-2">
              {isMe ? (
                <Button variant="outline" asChild>
                  <Link href="/profile/edit">Edit profile</Link>
                </Button>
              ) : (
                <>
                  <Button variant="outline" asChild title="Send a message">
                    <Link href={`/messages?with=${address}`}>
                      <Mail className="mr-1.5 h-4 w-4" />
                      Message
                    </Link>
                  </Button>
                  <TipButton to={address} username={data?.user.username} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles — hidden for admin */}
      {!isAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Realized PnL"
            value={stats ? usd(stats.pnl) : "—"}
            tone={stats ? (stats.pnl >= 0 ? "pos" : "neg") : "neutral"}
          />
          <StatTile
            label="Record"
            value={stats ? `${stats.wins}W · ${stats.losses}L` : "—"}
          />
          <StatTile
            label="Win rate"
            value={stats ? `${(stats.winRate * 100).toFixed(0)}%` : "—"}
          />
          <StatTile
            label="Volume"
            value={
              stats
                ? `$${stats.volume.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`
                : "—"
            }
          />
        </div>
      )}

      {!isAdmin && <PnlChart address={address} />}

      <div className={cn("grid gap-6", !isAdmin && "md:grid-cols-[1fr_280px]")}>
        {!isAdmin && (
          <div className="space-y-6">
            <BetColumn title="Bets won" bets={won} address={address} positive />
            <ProfileActivity address={address} />
            <BetColumn title="Bets lost" bets={lost} address={address} />
          </div>
        )}

        {!isAdmin && (
          <aside className="space-y-3">
            <ProfileComments target={address} />
            <section className="card p-5">
              <h3 className="mb-2 text-sm font-semibold">Wallet balance</h3>
              <ProfileBalances address={address} />
            </section>
            {stats && (
              <section className="card p-5 text-sm">
                <h3 className="mb-2 text-sm font-semibold">Activity</h3>
                <Row label="Open offers" value={stats.open} />
                <Row label="Awaiting settle" value={stats.matched} />
                <Row label="Settled" value={stats.settled} />
                <Row label="Pushes" value={stats.pushes} />
              </section>
            )}
          </aside>
        )}
      </div>

      {/* Everything this user created — hidden for admin */}
      {!isAdmin && (
        <CreatedSection bets={createdBets} markets={createdMarkets} />
      )}

      {isLoading && (
        <div className="text-center text-sm text-muted-foreground">Loading…</div>
      )}
    </div>
  );
}

function CreatedSection({
  bets,
  markets,
}: {
  bets: ProfileBet[];
  markets: ProfileMarket[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Created{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({bets.length + markets.length})
        </span>
      </h2>

      {bets.length === 0 && markets.length === 0 ? (
        <div className="card p-5 text-sm text-muted-foreground">
          Hasn&apos;t created any bets or markets yet.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {bets.map((b) => (
            <Link
              key={`bet-${b.id}`}
              href={`/bets/${b.id}`}
              className="card flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
            >
              <BetThumbnail imageUrl={b.imageUrl} title={b.title} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {b.title}
                </span>
                <span className="text-xs text-muted-foreground">Sidebet</span>
              </span>
              <StatusBadge status={b.status} />
            </Link>
          ))}
          {markets.map((m) => (
            <Link
              key={`market-${m.id}`}
              href={`/markets/${m.id}`}
              className="card flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
            >
              <BetThumbnail imageUrl={m.imageUrl} title={m.title} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  Market · {m.outcomeCount} outcomes
                </span>
              </span>
              <StatusBadge status={m.status as BetStatusName} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
      title="Copy wallet address"
    >
      {shortAddr(address, 10, 8)}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-bold",
          tone === "pos" && "text-success",
          tone === "neg" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1 text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function BetColumn({
  title,
  bets,
  address,
  positive,
}: {
  title: string;
  bets: ProfileBet[];
  address: string;
  positive?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({bets.length})
        </span>
      </h2>
      {bets.length === 0 ? (
        <div className="card p-5 text-sm text-muted-foreground">Nothing yet.</div>
      ) : (
        <div className="space-y-2">
          {bets.map((b) => {
            const delta = sidebetPnlDelta(b, address) ?? 0;
            return (
              <Link
                key={b.id}
                href={`/bets/${b.id}`}
                className="card flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
              >
                <BetThumbnail imageUrl={b.imageUrl} title={b.title} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {b.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums",
                      positive ? "text-success" : "text-danger",
                    )}
                  >
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    {b.tokenSymbol && (
                      <TokenSymbol
                        symbol={b.tokenSymbol}
                        size={14}
                        className={cn(
                          "font-sans font-medium",
                          !positive && "text-muted-foreground",
                        )}
                      />
                    )}
                  </span>
                  <StatusBadge status={b.status} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
