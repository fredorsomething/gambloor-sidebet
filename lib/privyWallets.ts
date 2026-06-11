import type { ConnectedWallet, User } from "@privy-io/react-auth";

/** Ethereum addresses linked to the authenticated Privy user. */
export function linkedEthereumAddresses(user: User | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!user) return out;
  for (const account of user.linkedAccounts) {
    if (
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      typeof account.address === "string"
    ) {
      out.add(account.address.toLowerCase());
    }
  }
  return out;
}

export function isPrivyEmbeddedWallet(
  wallet:
    | Pick<ConnectedWallet, "walletClientType" | "connectorType">
    | undefined,
): boolean {
  if (!wallet) return false;
  return (
    wallet.walletClientType === "privy" ||
    wallet.walletClientType === "privy-v2" ||
    wallet.connectorType === "embedded"
  );
}

/** True when the Privy user has a linked embedded (Sidebet) wallet account. */
export function userHasEmbeddedLinkedAccount(
  user: User | null | undefined,
): boolean {
  if (!user) return false;
  return user.linkedAccounts.some(
    (account) =>
      account.type === "wallet" &&
      isPrivyEmbeddedWallet({
        walletClientType: account.walletClientType,
        connectorType: account.connectorType ?? "embedded",
      }),
  );
}

/**
 * Pick the wagmi-active wallet for a Privy session.
 * Never selects browser-detected wallets that aren't linked to the user —
 * that mismatch is what triggers "this wallet is not linked to your account".
 */
export function pickActiveWalletForWagmi({
  wallets,
  user,
}: {
  wallets: ConnectedWallet[];
  user: User | null;
}): ConnectedWallet | undefined {
  if (wallets.length === 0) return undefined;

  const linked = linkedEthereumAddresses(user);
  const ethereum = wallets.filter((w) => w.type === "ethereum");

  if (user && linked.size > 0) {
    const owned = ethereum.filter((w) => linked.has(w.address.toLowerCase()));
    if (owned.length > 0) {
      return owned.find(isPrivyEmbeddedWallet) ?? owned[0];
    }
  }

  // Linked list not loaded yet — still prefer embedded over stray injected wallets.
  return ethereum.find(isPrivyEmbeddedWallet) ?? ethereum[0];
}
