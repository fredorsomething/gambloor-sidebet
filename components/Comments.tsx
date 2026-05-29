"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Avatar } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { fromNowUnix, shortAddr } from "@/lib/utils";

type Comment = {
  id: number;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
};

const unixOf = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Threaded comments for a sidebet or market. `basePath` is the comments
 * collection endpoint, e.g. `/api/bets/12/comments` or `/api/markets/4/comments`.
 */
export function Comments({ basePath }: { basePath: string }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { address } = useAccount();
  const { push } = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const key = ["thread-comments", basePath];
  const { data, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: key,
    queryFn: () => jsonFetch(basePath),
    staleTime: 8_000,
    refetchInterval: 20_000,
  });

  const post = useMutation({
    mutationFn: async (text: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch<{ comments: Comment[] }>(basePath, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ author: address, body: text }),
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setBody("");
    },
    onError: (err) =>
      push({ title: (err as Error)?.message || "Comment failed", variant: "danger" }),
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
      push({ title: (err as Error)?.message || "Delete failed", variant: "danger" }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!authenticated || !address) {
      void login();
      return;
    }
    const text = body.trim();
    if (!text) return;
    post.mutate(text);
  }

  const comments = data?.comments ?? [];

  return (
    <section className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Comments{" "}
        <span className="font-normal text-muted-foreground">
          ({comments.length})
        </span>
      </h3>

      <form onSubmit={submit} className="mb-4 space-y-2">
        <textarea
          className="textarea min-h-[64px] text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            authenticated ? "Add to the discussion…" : "Sign in to comment…"
          }
          maxLength={2000}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={post.isPending}>
            {post.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : comments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No comments yet. Start the conversation.
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const mine =
              !!address && c.author.toLowerCase() === address.toLowerCase();
            return (
              <li key={c.id} className="flex gap-3">
                <Link href={`/u/${c.author}`} className="shrink-0">
                  <Avatar
                    address={c.author}
                    url={c.authorAvatarUrl}
                    size={32}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link
                      href={`/u/${c.author}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.authorUsername
                        ? `@${c.authorUsername}`
                        : shortAddr(c.author)}
                    </Link>
                    <span>·</span>
                    <span>{fromNowUnix(unixOf(c.createdAt))}</span>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(c.id)}
                        disabled={remove.isPending}
                        className="ml-auto text-muted-foreground hover:text-danger"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
