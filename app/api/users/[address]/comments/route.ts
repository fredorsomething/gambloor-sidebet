import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import {
  checkProfileCommentRateLimit,
  formatCommentRetryAfter,
  isAllowedGifUrl,
} from "@/lib/commentInteractions";
import { listProfileComments } from "@/lib/comments";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/users/[address]/comments — public list of profile comments. */
export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const target = getAddress(handle);
  const viewer = req.nextUrl.searchParams.get("viewer");
  const comments = await listProfileComments(target, viewer);
  return jsonOk({ comments });
}

const PostSchema = z
  .object({
    author: z.string().refine(isAddress, "bad author"),
    body: z.string().trim().max(1000, "comment too long").optional().default(""),
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

/** POST /api/users/[address]/comments — leave a comment (Privy-authed). */
export async function POST(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  if (!isAddress(params.address)) return jsonErr("bad address", 400);
  const target = getAddress(params.address);

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

  // Validate reply parent belongs to this profile wall.
  let parentId: number | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.profileComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { target: true },
    });
    if (!parent || parent.target.toLowerCase() !== target.toLowerCase()) {
      return jsonErr("reply target not found", 400);
    }
    parentId = parsed.data.parentId;
  }

  const rate = await checkProfileCommentRateLimit(author);
  if (!rate.ok) {
    return jsonErr(
      `You're commenting too fast. Try again in ${formatCommentRetryAfter(
        rate.retryAfterSec,
      )}.`,
      429,
    );
  }

  await prisma.profileComment.create({
    data: {
      target: target.toLowerCase(),
      author: author.toLowerCase(),
      body: parsed.data.body.trim(),
      gifUrl: parsed.data.gifUrl ?? null,
      parentId,
    },
  });

  // Notify the profile owner (unless commenting on their own wall).
  if (target.toLowerCase() !== author.toLowerCase()) {
    const preview = parsed.data.body.trim()
      ? parsed.data.body.trim().slice(0, 100)
      : "[GIF]";
    await notify({
      recipient: target.toLowerCase(),
      type: parentId ? "reply" : "comment",
      title: "New comment on your profile",
      body: `${shortAddr(author)}: ${preview}`,
      link: `/u/${target}`,
    });
  }

  const comments = await listProfileComments(target, author);
  return jsonOk({ comments });
}
