import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { isAddress } from "viem";

import { BET_COVER_MAX_BYTES, resolveAvatarContentType } from "@/lib/avatarFile";
import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEX64 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Cover image upload for CLOB markets. Markets are keyed by their on-chain
 * conditionId (not an escrow id like sidebets), so the blob path uses
 * `markets/{chainId}/conditions/{conditionId}.{ext}`.
 */
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
  const conditionId = String(form.get("conditionId") ?? "");
  const file = form.get("file");

  if (!isAddress(addressRaw)) return jsonErr("bad address", 400);
  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return jsonErr("bad chainId", 400);
  }
  if (!HEX64.test(conditionId)) return jsonErr("bad conditionId", 400);

  const auth = await verifyWalletAuth({ req, address: addressRaw });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  if (!(file instanceof File)) return jsonErr("missing file", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const resolved = resolveAvatarContentType(file, bytes, BET_COVER_MAX_BYTES);
  if (!resolved.ok) return jsonErr(resolved.error, 400);

  const pathname = `markets/${chainId}/conditions/${conditionId.toLowerCase()}.${resolved.ext}`;

  try {
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: false,
      contentType: resolved.mime,
    });
    return jsonOk({ url: blob.url });
  } catch (err) {
    console.error("market image upload failed", err);
    const detail = err instanceof Error ? err.message : "";
    return jsonErr(detail ? `upload failed: ${detail}` : "upload failed", 500);
  }
}
