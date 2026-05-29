import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { isAdminAddress } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getRepSummary } from "@/lib/rep";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/rep?target=0x..&voter=0x.. — reputation summary for a target. */
export async function GET(req: NextRequest) {
  const targetRaw = req.nextUrl.searchParams.get("target") ?? "";
  const voterRaw = req.nextUrl.searchParams.get("voter") ?? "";
  if (!isAddress(targetRaw)) return jsonErr("bad target", 400);
  const voter = isAddress(voterRaw) ? getAddress(voterRaw) : null;
  const summary = await getRepSummary(getAddress(targetRaw), voter);
  return jsonOk(summary);
}

const PostSchema = z.object({
  voter: z.string().refine(isAddress, "bad voter"),
  target: z.string().refine(isAddress, "bad target"),
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

/**
 * POST /api/rep — cast (or clear) the caller's single vote on a target.
 * value: 1 = rep, -1 = downvote, 0 = remove. One vote per (voter, target).
 */
export async function POST(req: NextRequest) {
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

  const voter = getAddress(parsed.data.voter);
  const target = getAddress(parsed.data.target);
  const value = parsed.data.value;

  if (voter.toLowerCase() === target.toLowerCase()) {
    return jsonErr("you can't vote on yourself", 400);
  }

  if (isAdminAddress(target)) {
    return jsonErr("you can't rep the admin account", 400);
  }

  const auth = await verifyWalletAuth({ req, address: voter });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const key = { voter_target: { voter: voter.toLowerCase(), target: target.toLowerCase() } };

  if (value === 0) {
    await prisma.repVote.deleteMany({
      where: { voter: voter.toLowerCase(), target: target.toLowerCase() },
    });
  } else {
    await prisma.repVote.upsert({
      where: key,
      update: { value },
      create: {
        voter: voter.toLowerCase(),
        target: target.toLowerCase(),
        value,
      },
    });
  }

  const summary = await getRepSummary(target, voter);
  return jsonOk(summary);
}
