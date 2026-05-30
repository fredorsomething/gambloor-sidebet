import sharp from "sharp";

/** Satori (next/og) only renders PNG and JPEG reliably. */
const SATOTI_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function extMime(src: string): string | null {
  const lower = src.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

async function toSatoriDataUrl(buf: Buffer, mime: string): Promise<string | null> {
  if (SATOTI_IMAGE_MIMES.has(mime)) {
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  try {
    const png = await sharp(buf).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Fetch a remote image and return a data URL for Satori / ImageResponse. */
export async function loadRemoteImageDataUrl(
  src: string,
): Promise<string | null> {
  if (!src || src.startsWith("data:")) return src || null;
  try {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const headerMime =
      res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ??
      "";
    const mime = headerMime || extMime(src) || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) return null;
    return toSatoriDataUrl(buf, mime);
  } catch {
    return null;
  }
}
