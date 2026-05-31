"use client";

import { CommentBoard } from "@/components/CommentBoard";

/**
 * Threaded comments for a sidebet or market. `basePath` is the comments
 * collection endpoint, e.g. `/api/bets/12/comments` or `/api/markets/4/comments`.
 */
export function Comments({ basePath }: { basePath: string }) {
  const cooldownHint = "You can post one comment every minute.";

  return (
    <CommentBoard
      basePath={basePath}
      scope="thread"
      title="Comments"
      placeholder="Add to the discussion…"
      maxLength={2000}
      cooldownHint={cooldownHint}
    />
  );
}
