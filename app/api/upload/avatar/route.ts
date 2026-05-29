import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { verifyProfileAuth } from "@/lib/auth";
import { AVATAR_MAX_BYTES } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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
  const message = String(form.get("message") ?? "");
  const signature = String(form.get("signature") ?? "");
  const file = form.get("file");

  if (!isAddress(addressRaw)) return jsonErr("bad address", 400);
  if (!message || !signature.startsWith("0x")) {
    return jsonErr("missing auth", 401);
  }

  const auth = await verifyProfileAuth({ address: addressRaw, message, signature });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  if (!(file instanceof File)) return jsonErr("missing file", 400);
  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonErr("Use JPEG, PNG, WebP, or GIF.", 400);
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return jsonErr("Image must be 2 MB or smaller.", 400);
  }

  const address = getAddress(addressRaw);
  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";

  const pathname = `avatars/${address.toLowerCase()}/${Date.now()}.${ext}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });
    return jsonOk({ url: blob.url });
  } catch (err) {
    console.error("avatar upload failed", err);
    return jsonErr("upload failed", 500);
  }
}
