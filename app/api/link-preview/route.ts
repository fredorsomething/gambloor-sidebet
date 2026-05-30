import { NextRequest } from "next/server";

import { parseInternalLink, resolveLinkPreview } from "@/lib/linkPreview";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/link-preview?url= — rich card metadata for internal links. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) return jsonErr("url required", 400);
  if (url.length > 500) return jsonErr("url too long", 400);

  if (!parseInternalLink(url)) return jsonErr("unsupported link", 404);

  const preview = await resolveLinkPreview(url);
  if (!preview) return jsonErr("not found", 404);

  return jsonOk({ preview });
}
