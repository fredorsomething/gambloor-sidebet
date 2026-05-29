"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

import { Avatar } from "@/components/profile/Identity";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { ProfileBalances } from "@/components/profile/ProfileBalances";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";
import { cn, formatToken, shortAddr } from "@/lib/utils";
import type { UserStats } from "@/lib/stats";
import type { BetStatusName } from "@/lib/abi";

type ProfileBet = {
  id: number;
  title: string;
  amount: string;
  decimals: number;
  tokenSymbol: string | null;
  feeBps: number;
  proposer: string;
  acceptor: string | null;
  winner: string | null;
  status: BetStatusName;
};

type ProfileResponse = {
  user: {
    address: string;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    joinedAt: string | null;
  };
  stats: UserStats;
  bets: ProfileBet[];
};

function usd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export default function ProfilePage() {
  const params = useParams<{ address: string }>();
  const address = params.address;
  const { address: connected } = useAccount();
  const [editOpen, setEditOpen] = useState(false);

  const valid = isAddress(address);

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["userPage", address?.toLowerCase()],
    enabled: valid,
    queryFn: () => jsonFetch(`/api/users/${address}`),
  });

  if (!valid) {
    return (
      <div className="card p-10 text-center text-muted-foreground">
        Invalid address.
      </div>
    );
  }

  const isMe = eq(connected, address);
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              address={address}
              url={data?.user.avatarUrl}
              size={72}
              className="ring-2 ring-card"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">
                {data?.user.username || shortAddr(address)}
              </h1>
              <div className="font-mono text-sm text-muted-foreground">
                {shortAddr(address, 10, 8)}
              </div>
              {data?.user.bio && (
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {data.user.bio}
                </p>
              )}
            </div>
          </div>
          {isMe && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit profile
            </Button>
          )}
        </div>
      </div>

      {/* Stat tiles */}
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

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <BetColumn title="Bets won" bets={won} address={address} positive />
          <BetColumn title="Bets lost" bets={lost} address={address} />
        </div>

        <aside className="space-y-3">
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
      </div>

      {isLoading && (
        <div className="text-center text-sm text-muted-foreground">Loading…</div>
      )}

      {editOpen && data && (
        <EditProfileModal
          current={{
            address: data.user.address,
            username: data.user.username,
            avatarUrl: data.user.avatarUrl,
            bio: data.user.bio,
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
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
            const stake = Number(
              formatToken(BigInt(b.amount), b.decimals, 2),
            );
            const fee = stake * 2 * (b.feeBps / 10000);
            const delta = positive ? stake - fee : -stake;
            return (
              <Link
                key={b.id}
                href={`/bets/${b.id}`}
                className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {b.title}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      positive ? "text-success" : "text-danger",
                    )}
                  >
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {b.tokenSymbol}
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
