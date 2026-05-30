"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Gavel,
  MessageSquare,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { useNotifications, type AppNotification } from "@/lib/hooks/useNotifications";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { cn } from "@/lib/utils";

function iconFor(type: string) {
  switch (type) {
    case "bet_settled":
    case "market_resolved":
      return Trophy;
    case "comment":
    case "reply":
      return MessageSquare;
    case "resolution_proposed":
    case "resolution_verified":
    case "resolution_rejected":
      return Gavel;
    case "market_approved":
    case "market_rejected":
      return ShieldCheck;
    case "deposit":
      return ArrowDownToLine;
    case "withdrawal":
      return ArrowUpRight;
    default:
      return Bell;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function NotificationBell() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const { items, unread, markRead } = useNotifications();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!ready || !authenticated || !address) return null;

  const panelContent = (
    <>
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="text-sm font-semibold">Notifications</div>
        {unread > 0 && (
          <button
            onClick={() => markRead.mutate(undefined)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[26rem] overflow-y-auto md:max-h-[26rem]">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          items.map((n) => (
            <Row
              key={n.id}
              n={n}
              onClose={() => setOpen(false)}
              markRead={markRead.mutate}
            />
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <MobileBottomSheet open={open} onClose={() => setOpen(false)}>
            {panelContent}
          </MobileBottomSheet>
          <div className="absolute right-0 top-full z-[120] mt-2 hidden w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 md:block">
            {panelContent}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  n,
  onClose,
  markRead,
}: {
  n: AppNotification;
  onClose: () => void;
  markRead: (ids?: number[]) => void;
}) {
  const Icon = iconFor(n.type);
  const content = (
    <div
      className={cn(
        "flex gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
        !n.read && "bg-primary/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          n.read ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{n.title}</p>
          {!n.read && (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        {n.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {n.body}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {relativeTime(n.createdAt)}
        </p>
      </div>
    </div>
  );

  const handle = () => {
    if (!n.read) markRead([n.id]);
    onClose();
  };

  if (n.link) {
    return (
      <Link href={n.link} onClick={handle} className="block border-b border-border/60 last:border-0">
        {content}
      </Link>
    );
  }
  return (
    <button
      onClick={handle}
      className="block w-full border-b border-border/60 text-left last:border-0"
    >
      {content}
    </button>
  );
}
