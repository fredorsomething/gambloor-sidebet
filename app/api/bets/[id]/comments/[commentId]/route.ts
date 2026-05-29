import { NextRequest } from "next/server";

import { handleDeleteComment } from "@/lib/threadCommentHandlers";

export const dynamic = "force-dynamic";

export function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  return handleDeleteComment(req, "bet", params.id, params.commentId);
}
