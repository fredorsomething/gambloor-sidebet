/** Canonical public site origin for OG tags, absolute URLs, etc. */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://sidebet.lol";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getSiteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Path to the route's opengraph-image.tsx endpoint. */
export function openGraphImagePath(pagePath: string): string {
  const path = pagePath.split(/[?#]/)[0] || "/";
  if (path === "/") return "/opengraph-image";
  return `${path.replace(/\/$/, "")}/opengraph-image`;
}
