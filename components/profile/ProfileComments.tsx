"use client";

import { CommentBoard } from "@/components/CommentBoard";

export function ProfileComments({ target }: { target: string }) {
  return (
    <CommentBoard
      basePath={`/api/users/${target}/comments`}
      scope="profile"
      title="Comments"
      placeholder="Leave a public comment…"
      maxLength={1000}
    />
  );
}
