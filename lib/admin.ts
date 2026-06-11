import { getAddress } from "viem";

import { shortAddr } from "@/lib/utils";

/** Default platform settler / admin wallet. */
export const ADMIN_ADDRESS = getAddress(
  "0x445525f628D4840e2F14148f2547e6F270Caa3eb",
);

export const ADMIN_USERNAME = "admin";

export function isAdminAddress(address?: string | null): boolean {
  if (!address) return false;
  try {
    return getAddress(address).toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  } catch {
    return false;
  }
}

export function isAdminUser(user?: {
  address?: string | null;
  username?: string | null;
}): boolean {
  if (!user) return false;
  if (isAdminAddress(user.address)) return true;
  return (user.username ?? "").toLowerCase() === ADMIN_USERNAME;
}

/** Label shown in settler pickers. Admin keeps a friendly name; others use wallet only. */
export function formatSettlerLabel(address: string): string {
  if (isAdminAddress(address)) return "@Admin (default)";
  return shortAddr(address);
}
