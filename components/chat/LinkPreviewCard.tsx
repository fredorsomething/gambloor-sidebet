"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { jsonFetch } from "@/lib/fetcher";
import { normalizePreviewUrl, type LinkPreviewData } from "@/lib/linkPreview";
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
    return (
      <>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sidebet · {p.status}
        </span>
        <span className="truncate text-sm font-semibold leading-snug">{p.title}</span>
        {p.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{p.subtitle}</span>
        )}
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
