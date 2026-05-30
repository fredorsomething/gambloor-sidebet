import { getPlatformSettings } from "@/lib/platformSettings";
import { jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/platform/settings — public flags for UI gating. */
export async function GET() {
  const settings = await getPlatformSettings();
  return jsonOk({
    allowMarketCreation: settings.allowMarketCreation,
    sidebetFeeBps: settings.sidebetFeeBps,
    updatedAt: settings.updatedAt,
  });
}
