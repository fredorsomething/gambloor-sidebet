"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageSquare, Reply, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { GifPicker } from "@/components/GifPicker";
import { Avatar } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { cn, fromNowUnix, shortAddr } from "@/lib/utils";

export type CommentScope = "thread" | "profile";

type Comment = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  body: string;
  gifUrl: string | null;
  parentId: number | null;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
};

const unixOf = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Rich comment board shared by sidebet/market threads and profile walls.
 * Supports nested replies, likes, and attaching a GIF. `basePath` is the
 * comment collection endpoint; `scope` selects the like namespace.
 */
export function CommentBoard({
  basePath,
  scope,
  title = "Comments",
  placeholder = "Add to the discussion…",
  maxLength = 2000,
}: {
  basePath: string;
  scope: CommentScope;
  title?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { address } = useAccount();
  const { push } = useToast();
  const qc = useQueryClient();

  const [body, setBody] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const viewerQ = address ? `?viewer=${address}` : "";
  const key = ["comment-board", basePath, address ?? ""];
  const { data, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: key,
    queryFn: () => jsonFetch(`${basePath}${viewerQ}`),
    staleTime: 8_000,
    refetchInterval: 20_000,
  });

  const post = useMutation({
    mutationFn: async (input: {
      text: string;
      gifUrl: string | null;
      parentId: number | null;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<{ comments: Comment[] }>(basePath, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          author: address,
          body: input.text,
          gifUrl: input.gifUrl,
          parentId: input.parentId,
        }),
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setBody("");
      setGifUrl(null);
      setReplyTo(null);
    },
    onError: (err) =>
      push({
        title: (err as Error)?.message || "Comment failed",
        variant: "danger",
      }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<{ comments: Comment[] }>(
        `${basePath}/${id}?author=${address}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
    },
    onSuccess: (res) => qc.setQueryData(key, res),
    onError: (err) =>
      push({
        title: (err as Error)?.message || "Delete failed",
        variant: "danger",
      }),
  });

  const like = useMutation({
    mutationFn: async (id: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<{ liked: boolean; likes: number }>(
        `/api/comments/${scope}/${id}/like`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ liker: address }),
        },
      );
    },
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ comments: Comment[] }>(key);
      qc.setQueryData<{ comments: Comment[] }>(key, (old) =>
        old
          ? {
              comments: old.comments.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      likedByMe: !c.likedByMe,
                      likes: c.likes + (c.likedByMe ? -1 : 1),
                    }
                  : c,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      push({
        title: (err as Error)?.message || "Like failed",
        variant: "danger",
      });
    },
  });

  function ensureAuthed(): boolean {
    if (!authenticated || !address) {
      void login();
      return false;
    }
    return true;
  }

  function submitTopLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!ensureAuthed()) return;
    const text = body.trim();
    if (!text && !gifUrl) return;
    post.mutate({ text, gifUrl, parentId: null });
  }

  const all = data?.comments ?? [];
  const topLevel = all
    .filter((c) => c.parentId == null)
    .sort((a, b) => unixOf(b.createdAt) - unixOf(a.createdAt));
  const repliesByParent = new Map<number, Comment[]>();
  for (const c of all) {
    if (c.parentId == null) continue;
    const arr = repliesByParent.get(c.parentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentId, arr);
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => unixOf(a.createdAt) - unixOf(b.createdAt));
  }

  return (
    <section className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        {title}{" "}
        <span className="font-normal text-muted-foreground">({all.length})</span>
      </h3>

      <form onSubmit={submitTopLevel} className="mb-4 space-y-2">
        <textarea
          className="textarea min-h-[64px] text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={authenticated ? placeholder : "Sign in to comment…"}
          maxLength={maxLength}
        />
        {gifUrl && (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gifUrl}
              alt="Selected GIF"
              className="max-h-40 rounded-lg border border-border"
            />
            <button
              type="button"
              onClick={() => setGifUrl(null)}
              className="absolute -right-2 -top-2 rounded-full bg-card p-1 shadow ring-1 ring-border"
              aria-label="Remove GIF"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setGifOpen(true)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            GIF
          </button>
          <Button type="submit" size="sm" disabled={post.isPending}>
            {post.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          You can post one comment every 10 minutes.
        </p>
      </form>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : topLevel.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No comments yet. Start the conversation.
        </div>
      ) : (
        <ul className="space-y-4">
          {topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByParent.get(c.id) ?? []}
              myAddress={address}
              onLike={(id) => {
                if (!ensureAuthed()) return;
                like.mutate(id);
              }}
              onDelete={(id) => remove.mutate(id)}
              onReply={(parentId, text, gif) => {
                if (!ensureAuthed()) return;
                post.mutate({ text, gifUrl: gif, parentId });
              }}
              replyPending={post.isPending}
              activeReply={replyTo}
              setActiveReply={setReplyTo}
            />
          ))}
        </ul>
      )}

      {gifOpen && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onPick={(url) => {
            setGifUrl(url);
            setGifOpen(false);
          }}
        />
      )}
    </section>
  );
}

function CommentItem({
  comment,
  replies,
  myAddress,
  onLike,
  onDelete,
  onReply,
  replyPending,
  activeReply,
  setActiveReply,
}: {
  comment: Comment;
  replies: Comment[];
  myAddress?: string;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
  onReply: (parentId: number, text: string, gifUrl: string | null) => void;
  replyPending: boolean;
  activeReply: number | null;
  setActiveReply: (id: number | null) => void;
}) {
  return (
    <li>
      <CommentRow
        comment={comment}
        myAddress={myAddress}
        onLike={onLike}
        onDelete={onDelete}
        onToggleReply={() =>
          setActiveReply(activeReply === comment.id ? null : comment.id)
        }
      />

      {activeReply === comment.id && (
        <ReplyForm
          pending={replyPending}
          onCancel={() => setActiveReply(null)}
          onSubmit={(text, gif) => onReply(comment.id, text, gif)}
        />
      )}

      {replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-border pl-4">
          {replies.map((r) => (
            <li key={r.id}>
              <CommentRow
                comment={r}
                myAddress={myAddress}
                onLike={onLike}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CommentRow({
  comment: c,
  myAddress,
  onLike,
  onDelete,
  onToggleReply,
}: {
  comment: Comment;
  myAddress?: string;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleReply?: () => void;
}) {
  const mine = !!myAddress && c.author.toLowerCase() === myAddress.toLowerCase();
  return (
    <div className="flex gap-3">
      <Link href={`/u/${c.author}`} className="shrink-0">
        <Avatar address={c.author} url={c.authorAvatarUrl} size={32} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={`/u/${c.author}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {c.authorUsername ? `@${c.authorUsername}` : shortAddr(c.author)}
          </Link>
          <span>·</span>
          <span>{fromNowUnix(unixOf(c.createdAt))}</span>
          {mine && (
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              className="ml-auto text-muted-foreground hover:text-danger"
              aria-label="Delete comment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {c.body && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
            {c.body}
          </p>
        )}
        {c.gifUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.gifUrl}
            alt="GIF"
            className="mt-1.5 max-h-52 rounded-lg border border-border"
            loading="lazy"
          />
        )}
        <div className="mt-1.5 flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => onLike(c.id)}
            className={cn(
              "inline-flex items-center gap-1 transition-colors",
              c.likedByMe
                ? "text-danger"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Heart
              className={cn("h-3.5 w-3.5", c.likedByMe && "fill-current")}
            />
            {c.likes > 0 && <span>{c.likes}</span>}
          </button>
          {onToggleReply && (
            <button
              type="button"
              onClick={onToggleReply}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Reply className="h-3.5 w-3.5" />
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (text: string, gifUrl: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [gif, setGif] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);

  return (
    <div className="ml-11 mt-2 space-y-2">
      <textarea
        className="textarea min-h-[48px] text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        maxLength={2000}
        autoFocus
      />
      {gif && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gif}
            alt="Selected GIF"
            className="max-h-32 rounded-lg border border-border"
          />
          <button
            type="button"
            onClick={() => setGif(null)}
            className="absolute -right-2 -top-2 rounded-full bg-card p-1 shadow ring-1 ring-border"
            aria-label="Remove GIF"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGifOpen(true)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          GIF
        </button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={pending || (!text.trim() && !gif)}
            onClick={() => onSubmit(text.trim(), gif)}
          >
            Reply
          </Button>
        </div>
      </div>
      {gifOpen && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onPick={(url) => {
            setGif(url);
            setGifOpen(false);
          }}
        />
      )}
    </div>
  );
}

