"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ImageIcon, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { GifPicker } from "@/components/GifPicker";
import { Avatar } from "@/components/profile/Identity";
import { useProfile } from "@/lib/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";

type Conversation = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  lastBody: string;
  lastAt: string;
  fromMe: boolean;
  unread: number;
};

type ThreadMsg = {
  id: number;
  body: string;
  gifUrl: string | null;
  sender: string;
  recipient: string;
  senderAvatarUrl: string | null;
  createdAt: string;
  mine: boolean;
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 86_400_000)
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const withParam = searchParams.get("with");
  const { address } = useAccount();
  const { authenticated, getAccessToken, login, ready } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const me = address?.toLowerCase() ?? null;
  const selected = withParam ? withParam.toLowerCase() : null;
  const { data: myProfile } = useProfile(address);

  const [draft, setDraft] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);

  async function authedFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error("Your session expired. Please sign in again.");
    return jsonFetch<T>(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }

  const convosQ = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["dm-convos", me],
    enabled: !!me && authenticated,
    queryFn: () => authedFetch(`/api/messages?me=${address}`),
    refetchInterval: 8_000,
  });

  const threadQ = useQuery<{
    counterparty: {
      address: string;
      username: string | null;
      avatarUrl: string | null;
    };
    blocked: boolean;
    messages: ThreadMsg[];
  }>({
    queryKey: ["dm-thread", me, selected],
    enabled: !!me && authenticated && !!selected,
    queryFn: () =>
      authedFetch(`/api/messages?me=${address}&with=${selected}`),
    refetchInterval: 4_000,
  });

  const send = useMutation({
    mutationFn: async (payload: { body: string; gifUrl: string | null }) =>
      authedFetch<{ message: ThreadMsg }>(`/api/messages`, {
        method: "POST",
        body: JSON.stringify({
          from: address,
          to: selected,
          body: payload.body,
          gifUrl: payload.gifUrl,
        }),
      }),
    onSuccess: () => {
      setDraft("");
      setGifUrl(null);
      qc.invalidateQueries({ queryKey: ["dm-thread", me, selected] });
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
    },
    onError: (err) =>
      push({ title: (err as Error)?.message || "Send failed", variant: "danger" }),
  });

  const blockUser = useMutation({
    mutationFn: async () =>
      authedFetch(`/api/messages/block`, {
        method: "POST",
        body: JSON.stringify({ blocker: address, blocked: selected }),
      }),
    onSuccess: () => {
      push({ title: "User blocked", variant: "success" });
      router.replace("/messages");
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
    },
    onError: (err) =>
      push({ title: (err as Error)?.message || "Block failed", variant: "danger" }),
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadQ.data?.messages.length, selected]);

  if (ready && !authenticated) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Mail className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Your messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to read and send direct messages.
        </p>
        <Button className="mt-4" onClick={login}>
          Sign in
        </Button>
      </div>
    );
  }

  const conversations = convosQ.data?.conversations ?? [];
  const counterparty = threadQ.data?.counterparty;
  const cpLabel = counterparty?.username
    ? `@${counterparty.username}`
    : shortAddr(selected ?? "");

  function submit() {
    const body = draft.trim();
    if ((!body && !gifUrl) || !selected || send.isPending) return;
    send.mutate({ body, gifUrl });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-bold">Messages</h1>
      <div className="grid h-[70vh] gap-4 overflow-hidden rounded-2xl md:grid-cols-[300px_1fr]">
        <aside
          className={cn(
            "card flex flex-col overflow-hidden p-0",
            selected && "hidden md:flex",
          )}
        >
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Conversations
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No conversations yet. Visit a profile and hit{" "}
                <span className="font-medium">Message</span> to start one.
              </p>
            )}
            {conversations.map((c) => (
              <button
                key={c.address}
                onClick={() => router.replace(`/messages?with=${c.address}`)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                  selected === c.address && "bg-muted/60",
                )}
              >
                <Avatar
                  address={c.address}
                  url={c.avatarUrl}
                  size={36}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.username ? `@${c.username}` : shortAddr(c.address)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeLabel(c.lastAt)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.fromMe && "You: "}
                      {c.lastBody}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={cn(
            "card flex flex-col overflow-hidden p-0",
            !selected && "hidden md:flex",
          )}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a conversation to start chatting.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  className="md:hidden"
                  onClick={() => router.replace("/messages")}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar
                  address={selected}
                  url={counterparty?.avatarUrl}
                  size={32}
                />
                <Link
                  href={`/u/${counterparty?.username ?? selected}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
                >
                  {cpLabel}
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  disabled={blockUser.isPending || threadQ.data?.blocked}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Block ${cpLabel}? You won't be able to message each other.`,
                      )
                    ) {
                      blockUser.mutate();
                    }
                  }}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  {threadQ.data?.blocked ? "Blocked" : "Block"}
                </Button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {(threadQ.data?.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-2",
                      m.mine ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <Avatar
                      address={m.sender}
                      url={
                        m.mine
                          ? myProfile?.avatarUrl
                          : m.senderAvatarUrl ?? counterparty?.avatarUrl
                      }
                      size={28}
                      className="mt-1 shrink-0"
                    />
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                        m.mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {m.gifUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.gifUrl}
                          alt=""
                          className="mb-1 max-h-48 w-full rounded-lg object-contain"
                        />
                      )}
                      {m.body.trim() && (
                        <p className="whitespace-pre-wrap break-words">
                          {m.body}
                        </p>
                      )}
                      <span
                        className={cn(
                          "mt-1 block text-[10px]",
                          m.mine
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {timeLabel(m.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
                {threadQ.data && threadQ.data.messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet. Say hi!
                  </p>
                )}
                <div ref={bottomRef} />
              </div>

              {gifUrl && (
                <div className="border-t border-border px-3 pt-2">
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gifUrl}
                      alt=""
                      className="max-h-24 rounded-lg"
                    />
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

              <div className="flex items-end gap-2 border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => setGifOpen(true)}
                  className="shrink-0 rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Attach GIF"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <textarea
                  className="input min-h-[42px] max-h-32 flex-1 resize-none"
                  rows={1}
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <Button
                  onClick={submit}
                  disabled={(!draft.trim() && !gifUrl) || send.isPending}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </section>
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
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="card mx-auto mt-10 h-48 max-w-5xl animate-pulse" />
      }
    >
      <MessagesInner />
    </Suspense>
  );
}
