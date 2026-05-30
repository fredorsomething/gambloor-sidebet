import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { resolveDisplayBadges } from "@/lib/badges";
import { verifyWalletAuth } from "@/lib/auth";
import {
  SUPPORTER_PRICE_USDC,
  getTreasuryAddress,
  grantSupporterBadge,
  supporterPaymentTokens,
  userHasSupporterBadge,
  verifySupporterPayment,
} from "@/lib/supporterBadge";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/profile/supporter — public purchase config. */
export async function GET() {
  const treasury = getTreasuryAddress();
  return jsonOk({
    priceUsdc: SUPPORTER_PRICE_USDC,
    treasury,
    tokens: supporterPaymentTokens(),
  });
}

const PostSchema = z.object({
  from: z.string().refine(isAddress, "bad address"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "bad tx hash"),
  symbol: z.enum(["USDC", "USDC.e"]),
});

/** POST /api/profile/supporter — verify treasury payment and grant Supporter badge. */
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

  const buyer = getAddress(parsed.data.from);
  const auth = await verifyWalletAuth({ req, address: buyer });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({ where: { address: buyer } });
  if (userHasSupporterBadge(user?.badges)) {
    return jsonErr("supporter badge already owned", 409);
  }

  const verified = await verifySupporterPayment({
    buyer,
    txHash: parsed.data.txHash as `0x${string}`,
    tokenSymbol: parsed.data.symbol,
  });
  if (!verified.ok) {
    return jsonErr(verified.reason, 400);
  }

  const badges = await grantSupporterBadge(buyer, {
    txHash: parsed.data.txHash,
    logIndex: verified.logIndex,
    amount: verified.amount,
    token: verified.token,
  });

  return jsonOk({
    badges: resolveDisplayBadges(badges, buyer),
  });
}
