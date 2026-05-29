import { getAddress, isAddress } from "viem";

import { isAdminAddress } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";

export type AdminAuthResult =
  | { ok: true; address: string }
  | { ok: false; error: string; status: number };

/** Privy auth + platform admin wallet check for write routes. */
export async function requireAdmin(
  req: Request,
  addressParam: string,
): Promise<AdminAuthResult> {
  if (!isAddress(addressParam)) {
    return { ok: false, error: "bad address", status: 400 };
  }
  const address = getAddress(addressParam);
  if (!isAdminAddress(address)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
  return { ok: true, address };
}
