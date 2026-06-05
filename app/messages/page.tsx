"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ImageIcon, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { GifPicker } from "@/components/GifPicker";
import { MessagePreviews, MessageText } from "@/components/chat/RichMessageBody";
import { NegotiationCard } from "@/components/negotiations/NegotiationCard";
import { NegotiationCompose } from "@/components/negotiations/NegotiationCompose";
import { Avatar } from "@/components/profile/Identity";
import { UserNameWithBadge } from "@/components/profile/VerifiedBadge";
import { useProfile } from "@/lib/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import type { DmNegotiationBundle } from "@/lib/dmNegotiations";
import { jsonFetch } from "@/lib/fetcher";
import {
  type NegotiationBetContext,
} from "@/lib/negotiations";
import { cn, shortAddr } from "@/lib/utils";

type Conversation = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  blockedByMe: boolean;
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
  negotiation: DmNegotiationBundle | null;
};

type BetContextRow = {
  bet: NegotiationBetContext;
  proposerStake: string;
  acceptorStake: string;
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
  const betParam = searchParams.get("bet");
  const focusBetId = betParam ? Number(betParam) : null;
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
  type OfferCompose =
    | { betId: number; anchor: "card"; negId: number }
    | { betId: number; anchor: "dock" };
  const [offerCompose, setOfferCompose] = useState<OfferCompose | null>(null);

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
      verified: boolean;
    };
    blockedByMe: boolean;
    betContext: BetContextRow[];
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
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
      qc.invalidateQueries({ queryKey: ["dm-thread", me, selected] });
    },
    onError: (err) =>
      push({ title: (err as Error)?.message || "Block failed", variant: "danger" }),
  });

  const respondOffer = useMutation({
    mutationFn: async (vars: {
      betId: number;
      negId: number;
      action: "accept" | "decline" | "withdraw";
    }) =>
      authedFetch(`/api/bets/${vars.betId}/negotiations/${vars.negId}`, {
        method: "PATCH",
        body: JSON.stringify({ actor: address, action: vars.action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm-thread", me, selected] });
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
    },
    onError: (err) =>
      push({
        title: (err as Error)?.message || "Action failed",
        variant: "danger",
      }),
  });

  const sendOffer = useMutation({
    mutationFn: async (vars: {
      betId: number;
      proposerStake: string;
      acceptorStake: string;
      terms: string;
      message: string;
    }) =>
      authedFetch(`/api/bets/${vars.betId}/negotiations`, {
        method: "POST",
        body: JSON.stringify({
          from: address,
          to: selected,
          proposerStake: vars.proposerStake,
          acceptorStake: vars.acceptorStake,
          terms: vars.terms || undefined,
          message: vars.message || undefined,
        }),
      }),
    onSuccess: () => {
      setOfferCompose(null);
      qc.invalidateQueries({ queryKey: ["dm-thread", me, selected] });
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
      push({ title: "Offer sent", variant: "success" });
    },
    onError: (err) =>
      push({
        title: (err as Error)?.message || "Couldn't send offer",
        variant: "danger",
      }),
  });

  const unblockUser = useMutation({
    mutationFn: async () =>
      authedFetch(`/api/messages/block`, {
        method: "DELETE",
        body: JSON.stringify({ blocker: address, blocked: selected }),
      }),
    onSuccess: () => {
      push({ title: "User unblocked", variant: "success" });
      qc.invalidateQueries({ queryKey: ["dm-convos", me] });
      qc.invalidateQueries({ queryKey: ["dm-thread", me, selected] });
    },
    onError: (err) =>
      push({
        title: (err as Error)?.message || "Unblock failed",
        variant: "danger",
      }),
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusBetId && Number.isFinite(focusBetId)) {
      setOfferCompose({ betId: focusBetId, anchor: "dock" });
    }
  }, [focusBetId, selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadQ.data?.messages.length, selected]);

  useEffect(() => {
    if (offerCompose?.anchor !== "card") return;
    composeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [offerCompose]);

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
  const blockedByMe = threadQ.data?.blockedByMe ?? false;
  const betContext = threadQ.data?.betContext ?? [];
  const cpLabel = counterparty?.username
    ? `@${counterparty.username}`
    : shortAddr(selected ?? "");

  const composeBetId = offerCompose?.betId ?? focusBetId;
  const activeBetCtx =
    betContext.find((b) => b.bet.id === composeBetId) ??
    betContext[0] ??
    null;

  function renderNegotiationCompose(
    ctx: BetContextRow,
    stakes?: { proposerStake: string; acceptorStake: string },
  ) {
    return (
      <NegotiationCompose
        tokenSym={ctx.bet.tokenSymbol || "USDC"}
        decimals={ctx.bet.decimals}
        defaultProposerStake={stakes?.proposerStake ?? ctx.proposerStake}
        defaultAcceptorStake={stakes?.acceptorStake ?? ctx.acceptorStake}
        submitLabel="Send counter-offer"
        pending={sendOffer.isPending}
        onCancel={() => setOfferCompose(null)}
        onSubmit={(p) =>
          sendOffer.mutate({
            betId: ctx.bet.id,
            ...p,
          })
        }
      />
    );
  }

  function openPublishEscrow(betId: number) {
    router.push(`/bets/${betId}#revise-escrow`);
  }

  function submit() {
    const body = draft.trim();
    if ((!body && !gifUrl) || !selected || send.isPending) return;
    send.mutate({ body, gifUrl });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-bold">Messages</h1>
      <div
        className={cn(
          "grid gap-4 overflow-hidden rounded-2xl md:grid-cols-[300px_1fr]",
          selected
            ? "h-[calc(100dvh-5.5rem)] md:h-[70vh]"
            : "h-[min(70vh,calc(100dvh-5.5rem))]",
        )}
      >
        <aside
          className={cn(
            "card flex min-h-0 flex-col overflow-hidden p-0",
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserNameWithBadge
                        verified={c.verified}
                        name={
                          c.username
                            ? `@${c.username}`
                            : shortAddr(c.address)
                        }
                        className="truncate text-sm font-medium"
                      />
                      {c.blockedByMe && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Blocked
                        </span>
                      )}
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
            "card flex min-h-0 flex-col overflow-hidden p-0",
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
                  className="min-w-0 flex-1 text-sm font-semibold hover:text-primary"
                >
                  <UserNameWithBadge
                    verified={counterparty?.verified}
                    name={cpLabel}
                  />
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  disabled={blockUser.isPending || unblockUser.isPending}
                  onClick={() => {
                    if (blockedByMe) {
                      unblockUser.mutate();
                      return;
                    }
                    if (
                      window.confirm(
                        `Block ${cpLabel}? You won't be able to message each other until you unblock.`,
                      )
                    ) {
                      blockUser.mutate();
                    }
                  }}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  {blockedByMe ? "Unblock" : "Block"}
                </Button>
              </div>

              {blockedByMe && (
                <div className="border-b border-border bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
                  You blocked this user. Unblock to send messages again.
                </div>
              )}

              {betContext.length > 0 && !blockedByMe && (
                <div className="border-b border-border bg-muted/30 px-4 py-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Open sidebets with {cpLabel}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {betContext.map((b) => (
                      <button
                        key={b.bet.id}
                        type="button"
                        onClick={() =>
                          setOfferCompose((prev) =>
                            prev?.betId === b.bet.id && prev.anchor === "dock"
                              ? null
                              : { betId: b.bet.id, anchor: "dock" },
                          )
                        }
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                          (offerCompose?.betId === b.bet.id &&
                            offerCompose.anchor === "dock") ||
                            focusBetId === b.bet.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {b.bet.title.slice(0, 40)}
                        {b.bet.title.length > 40 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
                {(threadQ.data?.messages ?? []).map((m) => {
                  if (m.negotiation) {
                    const bundle = m.negotiation;
                    const n = bundle.negotiation;
                    const b = bundle.bet;
                    const tokenSym = b.tokenSymbol || "USDC";
                    if (b.status !== "Open") {
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex flex-col gap-1",
                            m.mine ? "items-end" : "items-start",
                          )}
                        >
                          <p className="max-w-sm rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <Link
                              href={`/bets/${b.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {b.title}
                            </Link>{" "}
                            — sidebet {b.status.toLowerCase()}. Negotiation is
                            closed.
                          </p>
                          <span className="px-1 text-[10px] text-muted-foreground">
                            {timeLabel(m.createdAt)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex flex-col gap-1",
                          m.mine ? "items-end" : "items-start",
                        )}
                      >
                        <NegotiationCard
                          compact
                          n={n}
                          betTitle={b.title}
                          betId={b.id}
                          decimals={b.decimals}
                          tokenSym={tokenSym}
                          viewerAddress={address}
                          betProposer={b.proposer}
                          betStatus={b.status}
                          busy={respondOffer.isPending || sendOffer.isPending}
                          onAccept={
                            n.status === "Pending"
                              ? () =>
                                  respondOffer.mutate({
                                    betId: b.id,
                                    negId: n.id,
                                    action: "accept",
                                  })
                              : undefined
                          }
                          onDecline={
                            n.status === "Pending"
                              ? () =>
                                  respondOffer.mutate({
                                    betId: b.id,
                                    negId: n.id,
                                    action: "decline",
                                  })
                              : undefined
                          }
                          onWithdraw={
                            n.status === "Pending"
                              ? () =>
                                  respondOffer.mutate({
                                    betId: b.id,
                                    negId: n.id,
                                    action: "withdraw",
                                  })
                              : undefined
                          }
                          escrowRevisionNeeded={b.escrowRevisionNeeded}
                          intendedAcceptor={b.intendedAcceptor}
                          onLockInEscrow={
                            n.status === "Accepted" &&
                            b.escrowRevisionNeeded &&
                            address?.toLowerCase() === b.proposer.toLowerCase()
                              ? () => openPublishEscrow(b.id)
                              : undefined
                          }
                          onCounter={
                            n.status === "Pending"
                              ? () =>
                                  setOfferCompose({
                                    betId: b.id,
                                    anchor: "card",
                                    negId: n.id,
                                  })
                              : undefined
                          }
                        />
                        {offerCompose?.anchor === "card" &&
                          offerCompose.negId === n.id &&
                          offerCompose.betId === b.id && (
                            <div
                              ref={composeRef}
                              className="mt-2 w-full max-w-full sm:max-w-sm"
                            >
                              {renderNegotiationCompose(
                                betContext.find((row) => row.bet.id === b.id) ?? {
                                  bet: b,
                                  proposerStake: n.proposerStake,
                                  acceptorStake: n.acceptorStake,
                                },
                                {
                                  proposerStake: n.proposerStake,
                                  acceptorStake: n.acceptorStake,
                                },
                              )}
                            </div>
                          )}
                        <span className="px-1 text-[10px] text-muted-foreground">
                          {timeLabel(m.createdAt)}
                        </span>
                      </div>
                    );
                  }

                  return (
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
                      <div className="flex max-w-[75%] flex-col gap-1.5">
                        <div
                          className={cn(
                            "rounded-2xl px-3 py-2 text-sm",
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
                            <MessageText
                              body={m.body}
                              className="whitespace-pre-wrap break-words"
                              linkClassName={
                                m.mine
                                  ? "break-all underline underline-offset-2 opacity-90 hover:opacity-100"
                                  : "break-all text-primary underline-offset-2 hover:underline"
                              }
                            />
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
                        {m.body.trim() && <MessagePreviews body={m.body} />}
                      </div>
                    </div>
                  );
                })}
                {threadQ.data && threadQ.data.messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet. Say hi!
                  </p>
                )}
                <div ref={bottomRef} />
              </div>

              {activeBetCtx &&
                offerCompose?.anchor === "dock" &&
                !blockedByMe && (
                  <div className="shrink-0 border-t border-border bg-card px-3 py-3 sm:px-4">
                    {renderNegotiationCompose(activeBetCtx)}
                  </div>
                )}

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

              {blockedByMe ? (
                <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
                  Messaging is disabled while this user is blocked.
                </div>
              ) : (
                <div className="flex shrink-0 items-end gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
              )}
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
