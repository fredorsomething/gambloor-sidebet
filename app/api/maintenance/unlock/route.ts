import { NextRequest, NextResponse } from "next/server";

import {
  MAINTENANCE_BYPASS_COOKIE,
  MAINTENANCE_BYPASS_VALUE,
  isMaintenancePassword,
} from "@/lib/maintenance";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** POST /api/maintenance/unlock — set bypass cookie when password is correct. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }

  const password =
    typeof body === "object" &&
    body &&
    "password" in body &&
    typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  if (!isMaintenancePassword(password)) {
    return jsonErr("incorrect password", 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(MAINTENANCE_BYPASS_COOKIE, MAINTENANCE_BYPASS_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
