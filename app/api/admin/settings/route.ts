import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/adminAuth";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/lib/platformSettings";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { syncSidebetFee } from "@/lib/syncSidebetFee";

export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    allowMarketCreation: z.boolean().optional(),
    sidebetFeeBps: z.number().int().min(0).max(1000).optional(),
  })
  .refine(
    (d) =>
      d.allowMarketCreation !== undefined || d.sidebetFeeBps !== undefined,
    { message: "provide allowMarketCreation and/or sidebetFeeBps" },
  );

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
    ...parsed.data,
    updatedBy: gate.address,
  });

  let feeSync: Awaited<ReturnType<typeof syncSidebetFee>> | undefined;
  if (parsed.data.sidebetFeeBps !== undefined) {
    feeSync = await syncSidebetFee(parsed.data.sidebetFeeBps);
  }

  return jsonOk({
    ...settings,
    feeSync: feeSync
      ? {
          onChainSynced: feeSync.onChainSynced,
          onChainTx: feeSync.onChainTx,
          onChainError: feeSync.onChainError,
        }
      : undefined,
  });
}

/** GET /api/admin/settings?address= — full platform settings (admin only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req, req.nextUrl.searchParams.get("address") ?? "");
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const settings = await getPlatformSettings();
  return jsonOk(settings);
}
