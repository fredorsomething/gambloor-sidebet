import { NextRequest } from "next/server";

import { normalizePreviewUrl, parseInternalLink, resolveLinkPreview } from "@/lib/linkPreview";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/link-preview?url= — rich card metadata for internal links. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim();
  if (!raw) return jsonErr("url required", 400);
  if (raw.length > 500) return jsonErr("url too long", 400);

  const url = normalizePreviewUrl(raw);
  if (!parseInternalLink(url)) return jsonErr("unsupported link", 404);

  const preview = await resolveLinkPreview(url);
  if (!preview) return jsonErr("not found", 404);

  return jsonOk({ preview });
}
