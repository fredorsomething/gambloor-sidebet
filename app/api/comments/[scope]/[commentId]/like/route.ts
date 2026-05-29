import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { toggleLike, type CommentScope } from "@/lib/commentInteractions";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  liker: z.string().refine(isAddress, "bad liker"),
});

function parseScope(s: string): CommentScope | null {
  return s === "thread" || s === "profile" ? s : null;
}

/** POST /api/comments/[scope]/[commentId]/like — toggle the caller's like. */
export async function POST(
  req: NextRequest,
  { params }: { params: { scope: string; commentId: string } },
) {
  const scope = parseScope(params.scope);
  if (!scope) return jsonErr("bad scope", 400);
  const commentId = Number(params.commentId);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return jsonErr("bad comment id", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const liker = getAddress(parsed.data.liker);
  const auth = await verifyWalletAuth({ req, address: liker });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Ensure the comment exists in the named table.
  const exists =
    scope === "thread"
      ? await prisma.threadComment.count({ where: { id: commentId } })
      : await prisma.profileComment.count({ where: { id: commentId } });
  if (!exists) return jsonErr("comment not found", 404);

  const result = await toggleLike(scope, commentId, liker);
  return jsonOk(result);
}
