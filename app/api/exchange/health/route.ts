import { engineIsHealthy } from "@/lib/engineClient";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/exchange/health — is the matching engine accepting orders? */
export async function GET() {
  const ok = await engineIsHealthy();
  if (!ok) return jsonErr("matching engine unavailable", 503);
  return jsonOk({ ok: true });
}
