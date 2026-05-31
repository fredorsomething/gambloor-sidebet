import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import {
  checkBetCommentRateLimit,
  checkMarketCommentRateLimit,
  formatCommentRetryAfter,
  isAllowedGifUrl,
} from "@/lib/commentInteractions";
import { prisma } from "@/lib/db";
import { notifyMany } from "@/lib/notifications";
import { loadSubject } from "@/lib/resolutionSubject";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { listThreadComments, type SubjectType } from "@/lib/threadComments";
import { shortAddr } from "@/lib/utils";

const PostSchema = z
  .object({
    author: z.string().refine(isAddress, "bad author"),
    body: z.string().trim().max(2000, "comment too long").optional().default(""),
    gifUrl: z
      .string()
      .refine((u) => isAllowedGifUrl(u), "invalid gif url")
      .nullable()
      .optional(),
    parentId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.body.trim().length > 0 || !!d.gifUrl, {
    message: "comment is empty",
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
  req: NextRequest,
  subjectType: SubjectType,
  idStr: string,
) {
  const id = parseId(idStr);
  if (id === null) return jsonErr("bad id", 400);
  const viewer = req.nextUrl.searchParams.get("viewer");
  const comments = await listThreadComments(subjectType, id, viewer);
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

  // Validate reply parent belongs to this thread.
  let parentId: number | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.threadComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { subjectType: true, subjectId: true },
    });
    if (!parent || parent.subjectType !== subjectType || parent.subjectId !== id) {
      return jsonErr("reply target not found", 400);
    }
    parentId = parsed.data.parentId;
  }

  const rate =
    subjectType === "market"
      ? await checkMarketCommentRateLimit(author)
      : await checkBetCommentRateLimit(author);
  if (!rate.ok) {
    return jsonErr(
      `You're commenting too fast. Try again in ${formatCommentRetryAfter(
        rate.retryAfterSec,
      )}.`,
      429,
    );
  }

  await prisma.threadComment.create({
    data: {
      subjectType,
      subjectId: id,
      author: author.toLowerCase(),
      body: parsed.data.body.trim(),
      gifUrl: parsed.data.gifUrl ?? null,
      parentId,
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

  const preview = parsed.data.body.trim()
    ? parsed.data.body.trim().slice(0, 100)
    : "[GIF]";
  await notifyMany(recipients, {
    type: parentId ? "reply" : "comment",
    title: subject ? `New comment on ${subject.title}` : "New comment",
    body: `${shortAddr(author)}: ${preview}`,
    link: subject?.link ?? null,
  });

  const comments = await listThreadComments(subjectType, id, author);
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

  // Remove the comment, its likes, and re-parent/delete direct replies.
  await prisma.$transaction([
    prisma.commentLike.deleteMany({
      where: { scope: "thread", commentId },
    }),
    prisma.threadComment.deleteMany({ where: { parentId: commentId } }),
    prisma.threadComment.delete({ where: { id: commentId } }),
  ]);

  const comments = await listThreadComments(subjectType, id, caller);
  return jsonOk({ comments });
}
