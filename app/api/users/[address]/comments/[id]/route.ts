import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { listProfileComments } from "@/lib/comments";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** DELETE /api/users/[address]/comments/[id] — author removes their own comment. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { address: string; id: string } },
) {
  if (!isAddress(params.address)) return jsonErr("bad address", 400);
  const target = getAddress(params.address);
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const callerRaw = req.nextUrl.searchParams.get("author") ?? "";
  if (!isAddress(callerRaw)) return jsonErr("bad author", 400);
  const caller = getAddress(callerRaw);

  const auth = await verifyWalletAuth({ req, address: caller });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const comment = await prisma.profileComment.findUnique({ where: { id } });
  if (!comment) return jsonErr("not found", 404);
  if (comment.author.toLowerCase() !== caller.toLowerCase()) {
    return jsonErr("you can only delete your own comments", 403);
  }

  await prisma.$transaction([
    prisma.commentLike.deleteMany({ where: { scope: "profile", commentId: id } }),
    prisma.profileComment.deleteMany({ where: { parentId: id } }),
    prisma.profileComment.delete({ where: { id } }),
  ]);

  const comments = await listProfileComments(target, caller);
  return jsonOk({ comments });
}
