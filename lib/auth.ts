import { getAddress } from "viem";

/**
 * Message a user signs to prove wallet ownership when editing their profile.
 * Kept identical between client (signing) and server (verification).
 */
export function buildProfileMessage(address: string, issuedAt: string): string {
  return [
    "Sidebet — Update profile",
    "",
    "Sign this message to update your Sidebet profile.",
    "This request will not trigger a transaction or cost any gas.",
    "",
    `Address: ${getAddress(address)}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function parseProfileMessage(
  message: string,
): { address: string; issuedAt: string } | null {
  const addrMatch = message.match(/^Address:\s*(0x[0-9a-fA-F]{40})$/m);
  const issuedMatch = message.match(/^Issued At:\s*(.+)$/m);
  if (!addrMatch || !issuedMatch) return null;
  try {
    return {
      address: getAddress(addrMatch[1]),
      issuedAt: issuedMatch[1].trim(),
    };
  } catch {
    return null;
  }
}

export const PROFILE_MESSAGE_TTL_MS = 15 * 60 * 1000;
