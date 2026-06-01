"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { jsonFetch } from "@/lib/fetcher";
import { normalizePreviewUrl, type LinkPreviewData } from "@/lib/linkPreview";
import { outcomeLabelTone, outcomeToneClass } from "@/lib/outcomeTone";
import { cn } from "@/lib/utils";

function pnlClass(n: number) {
  return n >= 0 ? "text-success" : "text-danger";
}

function pnlLabel(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
  })}`;
}

function OutcomePill({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        outcomeToneClass(outcomeLabelTone(label)),
      )}
    >
      {label}
    </span>
  );
}

export function LinkPreviewCard({ url }: { url: string }) {
  const canonical = normalizePreviewUrl(url);
  const { data, isLoading, isError } = useQuery<{ preview: LinkPreviewData }>({
    queryKey: ["link-preview", canonical],
    queryFn: () =>
      jsonFetch(`/api/link-preview?url=${encodeURIComponent(canonical)}`),
    staleTime: 120_000,
    retry: false,
  });

  if (isError) return null;
  if (isLoading) {
    return (
      <div className="mt-2 h-[4.5rem] animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }

  const p = data?.preview;
  if (!p) return null;

  return (
    <Link
      href={p.url}
      className="mt-2 flex overflow-hidden rounded-lg border border-border bg-muted/25 transition-colors hover:bg-muted/45"
    >
      <PreviewThumb preview={p} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-2">
        <PreviewMeta preview={p} />
      </div>
    </Link>
  );
}

function PreviewThumb({ preview: p }: { preview: LinkPreviewData }) {
  if (p.kind === "profile") {
    return (
      <div className="flex w-[4.5rem] shrink-0 items-center justify-center bg-muted/40 p-2">
        <Avatar
          address={p.address ?? "0x0"}
          url={p.imageUrl}
          size={52}
        />
      </div>
    );
  }

  if (p.kind === "site") {
    return (
      <div className="flex w-[4.5rem] shrink-0 items-center justify-center bg-muted/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.imageUrl ?? "/favicon.png"}
          alt=""
          className="h-11 w-11 rounded-lg object-cover ring-1 ring-border"
        />
      </div>
    );
  }

  return (
    <div className="flex w-[4.5rem] shrink-0 items-center justify-center p-2">
      <BetThumbnail
        imageUrl={p.imageUrl}
        title={p.title}
        size="sm"
        fallback
        className="!h-[3.75rem] !w-[3.75rem] rounded-xl"
      />
    </div>
  );
}

function PreviewMeta({ preview: p }: { preview: LinkPreviewData }) {
  if (p.kind === "profile") {
    return (
      <>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Profile
        </span>
        <UserNameWithBadge
          name={p.title}
          verified={p.verified}
          badgeSize={14}
          className="text-sm font-semibold"
        />
        {p.joinedAt && (
          <span className="text-xs text-muted-foreground">
            Date joined: {p.joinedAt}
          </span>
        )}
        {p.pnl != null && (
          <span className={cn("text-xs font-semibold tabular-nums", pnlClass(p.pnl))}>
            {pnlLabel(p.pnl)} PnL
          </span>
        )}
      </>
    );
  }

  if (p.kind === "bet") {
    const settled = p.status === "Settled";
    const matched = p.status === "Matched";
    const open = p.status === "Open";
    return (
      <>
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            settled
              ? "text-success"
              : matched
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          Sidebet · {p.status}
        </span>
        <span className="truncate text-sm font-semibold leading-snug">{p.title}</span>
        {open && p.betMatchup?.youBetLabel && p.betMatchup?.toWinLabel ? (
          <div className="mt-0.5 grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="rounded-md border border-border bg-card/70 px-2 py-1">
              <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                You bet
              </div>
              <div className="font-mono font-bold tabular-nums">
                {p.betMatchup.youBetLabel}
              </div>
            </div>
            <div className="rounded-md border border-success/30 bg-success/10 px-2 py-1">
              <div className="font-semibold uppercase tracking-wide text-success">
                To win
              </div>
              <div className="font-mono font-bold tabular-nums text-success">
                {p.betMatchup.toWinLabel}
              </div>
            </div>
          </div>
        ) : p.betMatchup?.resultLabel ? (
          <span className="truncate text-xs font-semibold text-success">
            {p.betMatchup.resultLabel}
          </span>
        ) : p.betMatchup ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            {p.betMatchup.proposer.outcomeLabel && (
              <OutcomePill label={p.betMatchup.proposer.outcomeLabel} />
            )}
            <span className="text-muted-foreground">vs</span>
            {p.betMatchup.acceptor.outcomeLabel && (
              <OutcomePill label={p.betMatchup.acceptor.outcomeLabel} />
            )}
          </span>
        ) : p.subtitle ? (
          <span className="truncate text-xs text-muted-foreground">{p.subtitle}</span>
        ) : null}
      </>
    );
  }

  if (p.kind === "market") {
    return (
      <>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Market · {p.status}
        </span>
        <span className="truncate text-sm font-semibold leading-snug">{p.title}</span>
        {p.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{p.subtitle}</span>
        )}
      </>
    );
  }

  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sidebet
      </span>
      <span className="truncate text-sm font-semibold">{p.title}</span>
      {p.subtitle && (
        <span className="truncate text-xs text-muted-foreground">{p.subtitle}</span>
      )}
    </>
  );
}
