import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notifications";
import { loadSubject } from "@/lib/resolutionSubject";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { listThreadComments, type SubjectType } from "@/lib/threadComments";
import { shortAddr } from "@/lib/utils";

const PostSchema = z.object({
  author: z.string().refine(isAddress, "bad author"),
  body: z
    .string()
    .trim()
    .min(1, "comment is empty")
    .max(2000, "comment too long"),
});

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function subjectExists(
  subjectType: SubjectType,
  id: number,
): Promise<boolean> {
  if (subjectType === "bet") {
    return (await prisma.bet.count({ where: { id } })) > 0;
  }
  return (await prisma.market.count({ where: { id } })) > 0;
}

/** GET — public list of thread comments. */
export async function handleListComments(
  subjectType: SubjectType,
  idStr: string,
) {
  const id = parseId(idStr);
  if (id === null) return jsonErr("bad id", 400);
  const comments = await listThreadComments(subjectType, id);
  return jsonOk({ comments });
}

/** POST — leave a comment (Privy-authed). */
export async function handlePostComment(
  req: NextRequest,
  subjectType: SubjectType,
  idStr: string,
) {
  const id = parseId(idStr);
  if (id === null) return jsonErr("bad id", 400);

  if (!(await subjectExists(subjectType, id))) {
    return jsonErr("not found", 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const author = getAddress(parsed.data.author);
  const auth = await verifyWalletAuth({ req, address: author });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  await prisma.threadComment.create({
    data: {
      subjectType,
      subjectId: id,
      author: author.toLowerCase(),
      body: parsed.data.body,
    },
  });

  // Notify the other participants and anyone who has commented in this thread.
  const subject = await loadSubject(subjectType, id);
  const priorAuthors = await prisma.threadComment.findMany({
    where: { subjectType, subjectId: id },
    select: { author: true },
    distinct: ["author"],
  });
  const recipients = [
    ...(subject?.participants ?? []),
    ...priorAuthors.map((c) => c.author),
  ].filter((a) => a.toLowerCase() !== author.toLowerCase());

  await notifyMany(recipients, {
    type: "comment",
    title: subject ? `New comment on ${subject.title}` : "New comment",
    body: `${shortAddr(author)}: ${parsed.data.body.slice(0, 100)}`,
    link: subject?.link ?? null,
  });

  const comments = await listThreadComments(subjectType, id);
  return jsonOk({ comments });
}

/** DELETE — author removes their own comment. */
export async function handleDeleteComment(
  req: NextRequest,
  subjectType: SubjectType,
  idStr: string,
  commentIdStr: string,
) {
  const id = parseId(idStr);
  const commentId = parseId(commentIdStr);
  if (id === null || commentId === null) return jsonErr("bad id", 400);

  const callerRaw = req.nextUrl.searchParams.get("author") ?? "";
  if (!isAddress(callerRaw)) return jsonErr("bad author", 400);
  const caller = getAddress(callerRaw);

  const auth = await verifyWalletAuth({ req, address: caller });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const comment = await prisma.threadComment.findUnique({
    where: { id: commentId },
  });
  if (!comment || comment.subjectType !== subjectType || comment.subjectId !== id) {
    return jsonErr("not found", 404);
  }
  if (comment.author.toLowerCase() !== caller.toLowerCase()) {
    return jsonErr("you can only delete your own comments", 403);
  }

  await prisma.threadComment.delete({ where: { id: commentId } });

  const comments = await listThreadComments(subjectType, id);
  return jsonOk({ comments });
}
