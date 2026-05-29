import { NextRequest } from "next/server";

import {
  handleListComments,
  handlePostComment,
} from "@/lib/threadCommentHandlers";

export const dynamic = "force-dynamic";

export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handleListComments("bet", params.id);
}

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handlePostComment(req, "bet", params.id);
}
