import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isMaintenanceBypassCookie,
  isMaintenancePublicPath,
  MAINTENANCE_BYPASS_COOKIE,
} from "@/lib/maintenance";

let cachedMaintenance: { value: boolean; at: number } | null = null;
const CACHE_MS = 15_000;

async function isMaintenanceModeOn(request: NextRequest): Promise<boolean> {
  const now = Date.now();
  if (cachedMaintenance && now - cachedMaintenance.at < CACHE_MS) {
    return cachedMaintenance.value;
  }

  try {
    const url = new URL("/api/platform/settings", request.url);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { maintenanceMode?: boolean };
    const value = body.maintenanceMode === true;
    cachedMaintenance = { value, at: now };
    return value;
  } catch {
    return false;
  }
}

/** Canonical profile URLs — /u/@name → /u/name for crawlers and shared links. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/u/@")) {
    const raw = pathname.slice("/u/".length).replace(/\/$/, "");
    const clean = decodeURIComponent(raw.replace(/^@/, ""));
    if (clean) {
      const url = request.nextUrl.clone();
      url.pathname = `/u/${encodeURIComponent(clean)}`;
      return NextResponse.redirect(url, 308);
    }
  }

  if (isMaintenancePublicPath(pathname)) {
    return NextResponse.next();
  }

  const bypass = isMaintenanceBypassCookie(
    request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value,
  );
  if (bypass) {
    return NextResponse.next();
  }

  const maintenanceOn = await isMaintenanceModeOn(request);
  if (maintenanceOn) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
