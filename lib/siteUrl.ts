/** Canonical public site origin for OG tags, absolute URLs, etc. */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // Custom production domain from Vercel project settings (e.g. sidebet.lol).
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return `https://${productionHost.replace(/\/$/, "")}`;
  }

  // Never use VERCEL_URL on production — per-deployment URLs are often
  // auth-gated (401) and break Discord/Twitter OG image fetches.
  if (process.env.VERCEL_ENV === "production") {
    return "https://sidebet.lol";
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://sidebet.lol";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getSiteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Normalize profile paths so /u/@name and /u/name share one canonical form. */
export function canonicalPath(path: string): string {
  const base = path.split(/[?#]/)[0] || "/";
  const profile = base.match(/^\/u\/(@?)(.+)$/);
  if (profile) {
    const handle = decodeURIComponent(profile[2]).replace(/^@/, "");
    return `/u/${encodeURIComponent(handle)}`;
  }
  return base.replace(/\/$/, "") || "/";
}

/** Path to the route's opengraph-image.tsx endpoint. */
export function openGraphImagePath(pagePath: string): string {
  const path = canonicalPath(pagePath);
  if (path === "/") return "/opengraph-image";
  return `${path}/opengraph-image`;
}

/** Absolute OG image URL; optional version busts Discord/CDN caches on status changes. */
export function openGraphImageUrl(pagePath: string, version?: string | null): string {
  const path = openGraphImagePath(pagePath);
  const base = absoluteUrl(path);
  if (!version) return base;
  return `${base}?v=${encodeURIComponent(version)}`;
}
