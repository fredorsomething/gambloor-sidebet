import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { listProfileComments } from "@/lib/comments";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/users/[address]/comments — public list of profile comments. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const target = getAddress(handle);
  const comments = await listProfileComments(target);
  return jsonOk({ comments });
}

const PostSchema = z.object({
  author: z.string().refine(isAddress, "bad author"),
  body: z.string().trim().min(1, "comment is empty").max(1000, "comment too long"),
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

  await prisma.profileComment.create({
    data: {
      target: target.toLowerCase(),
      author: author.toLowerCase(),
      body: parsed.data.body,
    },
  });

  const comments = await listProfileComments(target);
  return jsonOk({ comments });
}
