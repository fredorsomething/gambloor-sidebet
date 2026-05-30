import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Canonical profile URLs — /u/@name → /u/name for crawlers and shared links. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/u/@")) return NextResponse.next();

  const raw = pathname.slice("/u/".length).replace(/\/$/, "");
  const clean = decodeURIComponent(raw.replace(/^@/, ""));
  if (!clean) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/u/${encodeURIComponent(clean)}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/u/:path*"],
};
