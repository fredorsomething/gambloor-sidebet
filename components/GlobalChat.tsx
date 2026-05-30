"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  MessageCircle,
  Send,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { GifPicker } from "@/components/GifPicker";
import { RichMessageBody } from "@/components/chat/RichMessageBody";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { lockBodyScroll } from "@/lib/bodyScrollLock";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";

type ChatMessage = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  authorPnl: number;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};

type ChatResponse = { messages: ChatMessage[]; online: number };

const CHAT_WIDTH_PX = 320;
const LAST_READ_KEY = "sb_chat_last_read_id";

function readLastReadId(): number | null {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function persistLastReadId(id: number) {
  try {
    localStorage.setItem(LAST_READ_KEY, String(id));
  } catch {
    /* ignore */
  }
}

function latestMessageId(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0;
  return Math.max(...messages.map((m) => m.id));
}

function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem("sb_chat_cid");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("sb_chat_cid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function pnlLabel(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: n >= 100 || n <= -100 ? 0 : 2,
  })}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 86_400_000)
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GlobalChat() {
  const { authenticated, getAccessToken, login, ready } = usePrivy();
  const { address } = useAccount();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [lastReadId, setLastReadId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);

  const cid = useMemo(() => getClientId(), []);
  const me = address?.toLowerCase() ?? null;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollChatToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  useEffect(() => {
    try {
      if (localStorage.getItem("sb_chat_open") === "1") setOpen(true);
    } catch {
      /* ignore */
    }
    setLastReadId(readLastReadId());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sb_chat_open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    return lockBodyScroll();
  }, [open]);

  const chatQ = useQuery<ChatResponse>({
    queryKey: ["global-chat"],
    queryFn: () =>
      jsonFetch(
        `/api/chat?cid=${encodeURIComponent(cid)}${me ? `&me=${me}` : ""}`,
      ),
    refetchInterval: open ? 3_000 : 20_000,
  });

  const messages = chatQ.data?.messages ?? [];
  const online = chatQ.data?.online ?? 0;

  function markChatRead(msgs: ChatMessage[]) {
    const maxId = latestMessageId(msgs);
    if (maxId <= 0) return;
    setLastReadId(maxId);
    persistLastReadId(maxId);
  }

  function setChatOpen(next: boolean) {
    if (!next) markChatRead(messages);
    setOpen(next);
  }

  useEffect(() => {
    if (open || messages.length === 0 || lastReadId != null) return;
    markChatRead(messages);
  }, [open, messages, lastReadId]);

  useEffect(() => {
    if (!open || messages.length === 0) return;
    markChatRead(messages);
  }, [open, messages]);

  const unreadCount =
    !open && lastReadId != null
      ? messages.filter((m) => m.id > lastReadId).length
      : 0;

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) scrollChatToBottom("smooth");
  }, [messages.length, open]);

  useEffect(() => {
    if (open) scrollChatToBottom();
  }, [open]);

  const send = useMutation({
    mutationFn: async (payload: { body: string; gifUrl: string | null }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch(`/api/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          from: address,
          body: payload.body,
          gifUrl: payload.gifUrl,
        }),
      });
    },
    onSuccess: () => {
      setDraft("");
      setGifUrl(null);
      qc.invalidateQueries({ queryKey: ["global-chat"] });
    },
  });

  function submit() {
    const body = draft.trim();
    if ((!body && !gifUrl) || send.isPending) return;
    if (!authenticated) {
      void login();
      return;
    }
    send.mutate({ body, gifUrl });
  }

  function CollapseTab({ expanded }: { expanded: boolean }) {
    const unreadLabel =
      unreadCount > 0
        ? `, ${unreadCount} new message${unreadCount === 1 ? "" : "s"}`
        : "";
    return (
      <button
        type="button"
        onClick={() => setChatOpen(!expanded)}
        className={cn(
          "relative hidden shrink-0 flex-col items-center justify-center gap-1 border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground md:flex",
          expanded
            ? "h-20 w-7 rounded-r-xl border-l-0"
            : "fixed left-0 top-1/2 z-50 h-24 w-8 -translate-y-1/2 rounded-r-xl border-l-0",
        )}
        aria-label={
          expanded ? "Minimize chat" : `Open global chat${unreadLabel}`
        }
      >
        {!expanded && unreadCount > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white shadow-sm"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {expanded ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <>
            <ChevronRight className="h-5 w-5 text-primary" />
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-semibold tabular-nums text-success">
              {online}
            </span>
          </>
        )}
      </button>
    );
  }

  /** Mobile-only tab when chat is collapsed. */
  function MobileOpenTab() {
    const unreadLabel =
      unreadCount > 0
        ? `, ${unreadCount} new message${unreadCount === 1 ? "" : "s"}`
        : "";
    return (
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="fixed left-0 top-1/2 z-50 flex h-24 w-8 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-r-xl border border-l-0 border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground md:hidden"
        aria-label={`Open global chat${unreadLabel}`}
      >
        {unreadCount > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white shadow-sm"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <ChevronRight className="h-5 w-5 text-primary" />
        <MessageCircle className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-semibold tabular-nums text-success">
          {online}
        </span>
      </button>
    );
  }

  if (!open) {
    return (
      <>
        <CollapseTab expanded={false} />
        <MobileOpenTab />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex items-center",
          "max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Global chat"
      >
        {/* Mobile backdrop */}
        <button
          type="button"
          className="absolute inset-0 bg-black/40 md:hidden"
          aria-label="Close chat"
          onClick={() => setChatOpen(false)}
        />

        <aside
          className={cn(
            "relative z-10 flex min-h-0 max-h-screen flex-col border-r border-border bg-card/95 shadow-2xl backdrop-blur-sm",
            "max-md:h-full max-md:max-h-[100dvh] max-md:w-full max-md:border-r-0",
          )}
          style={{ width: CHAT_WIDTH_PX }}
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Global chat</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-success"
                  title="Users online"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {online} online
                </span>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3"
            >
              {chatQ.isLoading && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Loading chat…
                </p>
              )}
              {!chatQ.isLoading && messages.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No messages yet. Say hi to the room!
                </p>
              )}
              {messages.map((m) => (
                <ChatRow key={m.id} m={m} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* GIF preview */}
            {gifUrl && (
              <div className="shrink-0 border-t border-border px-3 pt-2">
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gifUrl} alt="" className="max-h-20 rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setGifUrl(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-card px-1.5 py-0.5 text-xs shadow"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Composer — always pinned to bottom with safe-area padding */}
            {ready && !authenticated ? (
              <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
                <button
                  onClick={login}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </button>{" "}
                to join the chat.
              </div>
            ) : (
              <div className="shrink-0 border-t border-border p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setGifOpen(true)}
                    className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Attach GIF"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                  <textarea
                    className="input min-h-[38px] max-h-24 flex-1 resize-none py-2 text-sm"
                    rows={1}
                    maxLength={500}
                    placeholder="Message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={submit}
                    disabled={(!draft.trim() && !gifUrl) || send.isPending}
                    className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {send.isError && (
              <p className="shrink-0 border-t border-border bg-danger/10 px-3 py-1.5 text-center text-[11px] text-danger">
                {(send.error as Error)?.message || "Couldn't send message"}
              </p>
            )}
        </aside>

        <CollapseTab expanded />
      </div>

      {gifOpen && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onPick={(url) => {
            setGifUrl(url);
            setGifOpen(false);
          }}
        />
      )}
    </>
  );
}

function ChatRow({ m }: { m: ChatMessage }) {
  const name = m.authorUsername ? `@${m.authorUsername}` : shortAddr(m.author);
  const profileHref = `/u/${m.authorUsername ?? m.author}`;
  const pnlPositive = m.authorPnl >= 0;

  return (
    <div className="flex gap-2">
      <Link href={profileHref} className="shrink-0">
        <Avatar address={m.author} url={m.authorAvatarUrl} size={28} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <Link
            href={profileHref}
            className="min-w-0 font-semibold text-foreground hover:text-primary"
          >
            <UserNameWithBadge
              name={name}
              verified={m.authorVerified}
              badgeSize={16}
              className="max-w-[160px]"
            />
          </Link>
          <span
            className={cn(
              "rounded px-1 py-px text-[10px] font-semibold tabular-nums",
              pnlPositive
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger",
            )}
            title="Realized PnL"
          >
            {pnlLabel(m.authorPnl)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {timeLabel(m.createdAt)}
          </span>
        </div>
        {m.gifUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.gifUrl}
            alt=""
            className="mt-1 max-h-32 rounded-lg border border-border"
            loading="lazy"
          />
        )}
        {m.body.trim() && <RichMessageBody body={m.body} />}
      </div>
    </div>
  );
}
