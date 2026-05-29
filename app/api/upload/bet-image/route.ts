import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { BET_COVER_MAX_BYTES, resolveAvatarContentType } from "@/lib/avatarFile";
import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DECIMAL = /^[0-9]+$/;

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonErr(
      "Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.",
      503,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonErr("invalid form data", 400);
  }

  const addressRaw = String(form.get("address") ?? "");
  const chainIdRaw = String(form.get("chainId") ?? "");
  const escrowRaw = String(form.get("escrowAddress") ?? "");
  const onchainId = String(form.get("onchainId") ?? "");
  const file = form.get("file");

  if (!isAddress(addressRaw)) return jsonErr("bad address", 400);
  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return jsonErr("bad chainId", 400);
  }
  if (!isAddress(escrowRaw)) return jsonErr("bad escrow address", 400);
  if (!DECIMAL.test(onchainId)) return jsonErr("bad onchainId", 400);

  const auth = await verifyWalletAuth({ req, address: addressRaw });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  if (!(file instanceof File)) return jsonErr("missing file", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const resolved = resolveAvatarContentType(file, bytes, BET_COVER_MAX_BYTES);
  if (!resolved.ok) return jsonErr(resolved.error, 400);

  const address = getAddress(addressRaw);
  const escrow = getAddress(escrowRaw).toLowerCase();
  const pathname = `markets/${chainId}/${escrow}/${onchainId}.${resolved.ext}`;

  try {
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: false,
      contentType: resolved.mime,
    });
    return jsonOk({ url: blob.url });
  } catch (err) {
    console.error("bet image upload failed", err);
    return jsonErr("upload failed", 500);
  }
}
