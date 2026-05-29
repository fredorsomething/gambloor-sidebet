import { NextRequest } from "next/server";

import { jsonErr } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// Placeholder for the "send 1 USDC -> receive POL for gas" helper.
// TODO: implement the swap/relayer (quote USDC->POL, pull USDC, send POL to the
// user's wallet) and verify the caller via verifyWalletAuth before executing.
export async function POST(_req: NextRequest) {
  return jsonErr(
    "Auto-funding isn't available yet. Deposit POL to your wallet to cover gas.",
    501,
  );
}
