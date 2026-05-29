import { jsonOk } from "@/lib/serialize";
import { listApprovedSettlers } from "@/lib/settlers";

export const dynamic = "force-dynamic";

export async function GET() {
  const settlers = await listApprovedSettlers();
  return jsonOk({ settlers });
}
