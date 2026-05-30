import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import { updatePlatformSettings } from "@/lib/platformSettings";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  allowMarketCreation: z.boolean(),
});

/** PATCH /api/admin/settings?address= — update platform flags (admin only). */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const settings = await updatePlatformSettings({
    allowMarketCreation: parsed.data.allowMarketCreation,
    updatedBy: gate.address,
  });
  return jsonOk(settings);
}
