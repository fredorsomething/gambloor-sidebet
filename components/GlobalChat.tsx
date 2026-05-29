"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, MessageCircle, Send, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { GifPicker } from "@/components/GifPicker";
import { Avatar } from "@/components/profile/Identity";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useProfile } from "@/lib/hooks/useProfile";
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

const SEND_COOLDOWN_MS = 3_000;
const CHAT_WIDTH_PX = 300;

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
  const { data: myProfile } = useProfile(address);
  const qc = useQueryClient();

  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const cid = useMemo(() => getClientId(), []);
  const me = address?.toLowerCase() ?? null;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Restore minimized preference (default: expanded).
  useEffect(() => {
    try {
      if (localStorage.getItem("sb_chat_open") === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sb_chat_open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  // Shift main layout when the desktop sidebar is open.
  useEffect(() => {
    const root = document.documentElement;
    if (open) {
      root.classList.add("global-chat-open");
      root.style.setProperty("--global-chat-width", `${CHAT_WIDTH_PX}px`);
    } else {
      root.classList.remove("global-chat-open");
      root.style.removeProperty("--global-chat-width");
    }
    return () => {
      root.classList.remove("global-chat-open");
      root.style.removeProperty("--global-chat-width");
    };
  }, [open]);

  // Tick for cooldown countdown.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const chatQ = useQuery<ChatResponse>({
    queryKey: ["global-chat"],
    queryFn: () =>
      jsonFetch(
        `/api/chat?cid=${encodeURIComponent(cid)}${me ? `&me=${me}` : ""}`,
      ),
    // Poll faster while open; keep a slow heartbeat while minimized so the
    // online count stays warm and presence is recorded.
    refetchInterval: open ? 3_000 : 20_000,
  });

  const messages = chatQ.data?.messages ?? [];
  const online = chatQ.data?.online ?? 0;

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

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
      setCooldownUntil(Date.now() + SEND_COOLDOWN_MS);
      qc.invalidateQueries({ queryKey: ["global-chat"] });
    },
  });

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const onCooldown = cooldownUntil > now;

  function submit() {
    const body = draft.trim();
    if ((!body && !gifUrl) || send.isPending || onCooldown) return;
    if (!authenticated) {
      void login();
      return;
    }
    send.mutate({ body, gifUrl });
  }

  // Minimized launcher.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors hover:bg-muted"
        aria-label="Open global chat"
      >
        <MessageCircle className="h-4 w-4 text-primary" />
        Chat
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {online}
        </span>
      </button>
    );
  }

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[300px] flex-col border-r border-border bg-card shadow-xl",
          "max-md:inset-0 max-md:z-50 max-md:w-full",
        )}
        aria-label="Global chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Global chat</span>
          </div>
          <div className="flex items-center gap-3">
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
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Minimize chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
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
          <div className="border-t border-border px-3 pt-2">
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

        {/* Composer */}
        {ready && !authenticated ? (
          <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
            <button
              onClick={login}
              className="font-semibold text-primary hover:underline"
            >
              Sign in
            </button>{" "}
            to join the chat.
          </div>
        ) : (
          <div className="flex items-end gap-2 border-t border-border p-2.5">
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
              placeholder={onCooldown ? `Wait ${cooldownLeft}s…` : "Message…"}
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
              disabled={
                (!draft.trim() && !gifUrl) || send.isPending || onCooldown
              }
              className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              aria-label="Send"
            >
              {onCooldown ? (
                <span className="text-xs font-semibold">{cooldownLeft}</span>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
        {send.isError && (
          <p className="border-t border-border bg-danger/10 px-3 py-1.5 text-center text-[11px] text-danger">
            {(send.error as Error)?.message || "Couldn't send message"}
          </p>
        )}
      </aside>

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
            className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-primary"
          >
            <span className="max-w-[120px] truncate">{name}</span>
            {m.authorVerified && <VerifiedBadge size={12} />}
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
        {m.body.trim() && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90">
            {m.body}
          </p>
        )}
      </div>
    </div>
  );
}
