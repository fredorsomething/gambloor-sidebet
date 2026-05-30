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
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
