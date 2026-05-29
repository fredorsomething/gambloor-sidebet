import { NextRequest } from "next/server";

import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Gif = { id: string; url: string; preview: string };

const GIPHY_KEY = process.env.GIPHY_API_KEY;
const TENOR_KEY = process.env.TENOR_API_KEY;

/**
 * GET /api/gifs?q=cats — proxy GIF search. Uses Giphy if GIPHY_API_KEY is set,
 * else Tenor if TENOR_API_KEY is set. Without a key it reports `configured:false`
 * so the client falls back to pasting a GIF URL directly.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  if (!GIPHY_KEY && !TENOR_KEY) {
    return jsonOk({ configured: false, gifs: [] as Gif[] });
  }

  try {
    if (GIPHY_KEY) {
      const endpoint = q
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(
            q,
          )}&limit=24&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json()) as {
        data?: {
          id: string;
          images?: {
            downsized_medium?: { url?: string };
            fixed_width?: { url?: string };
            fixed_width_small?: { url?: string };
          };
        }[];
      };
      const gifs: Gif[] = (json.data ?? [])
        .map((g) => ({
          id: g.id,
          url:
            g.images?.downsized_medium?.url ?? g.images?.fixed_width?.url ?? "",
          preview:
            g.images?.fixed_width_small?.url ??
            g.images?.fixed_width?.url ??
            "",
        }))
        .filter((g) => g.url);
      return jsonOk({ configured: true, gifs });
    }

    // Tenor
    const endpoint = q
      ? `https://tenor.googleapis.com/v2/search?key=${TENOR_KEY}&q=${encodeURIComponent(
          q,
        )}&limit=24&contentfilter=medium`
      : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=24&contentfilter=medium`;
    const res = await fetch(endpoint, { cache: "no-store" });
    const json = (await res.json()) as {
      results?: {
        id: string;
        media_formats?: {
          gif?: { url?: string };
          tinygif?: { url?: string };
        };
      }[];
    };
    const gifs: Gif[] = (json.results ?? [])
      .map((g) => ({
        id: g.id,
        url: g.media_formats?.gif?.url ?? "",
        preview: g.media_formats?.tinygif?.url ?? g.media_formats?.gif?.url ?? "",
      }))
      .filter((g) => g.url);
    return jsonOk({ configured: true, gifs });
  } catch {
    return jsonOk({ configured: true, gifs: [] as Gif[] });
  }
}
