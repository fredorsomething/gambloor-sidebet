import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  collectReferralEarnings,
  createReferralCampaign,
  getReferralDashboard,
  isValidReferralSlug,
  normalizeReferralSlug,
} from "@/lib/referrals";
import { Ledger } from "@/engine/ledger";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address || !isAddress(address)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const dashboard = await getReferralDashboard(auth.address);
  return jsonOk(dashboard);
}

const CreateSchema = z.object({
  address: z.string(),
  slug: z.string().min(1).max(32),
  label: z.string().max(60).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonErr(parsed.error.errors[0]?.message ?? "invalid");

  const auth = await verifyWalletAuth({ req, address: parsed.data.address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const result = await createReferralCampaign(
    auth.address,
    parsed.data.slug,
    parsed.data.label,
  );
  if (!result.ok) return jsonErr(result.error, 400);
  return jsonOk(result.campaign, { status: 201 });
}

const CollectSchema = z.object({
  address: z.string(),
});

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = CollectSchema.safeParse(body);
  if (!parsed.success) return jsonErr("invalid body");

  const auth = await verifyWalletAuth({ req, address: parsed.data.address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const result = await collectReferralEarnings(auth.address);
  if (!result.ok) return jsonErr(result.error, 400);

  const ledger = new Ledger(prisma);
  await ledger.creditReferralPayout({
    address: getAddress(auth.address),
    amount: result.amountMicro,
    collectionId: result.collectionId,
  });

  return jsonOk({
    collectedUsd: Number(result.amountMicro) / 1_000_000,
    collectionId: result.collectionId,
  });
}

export async function HEAD(req: NextRequest) {
  const slug = normalizeReferralSlug(
    req.nextUrl.searchParams.get("slug") ?? "",
  );
  if (!isValidReferralSlug(slug)) return new Response(null, { status: 400 });
  const exists = await prisma.referralCampaign.findUnique({
    where: { slug },
    select: { id: true },
  });
  return new Response(null, { status: exists ? 200 : 404 });
}
