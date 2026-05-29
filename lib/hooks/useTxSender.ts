"use client";

import {
  getEmbeddedConnectedWallet,
  useSendTransaction as usePrivySendTransaction,
  useWallets,
} from "@privy-io/react-auth";
import { useCallback, useMemo } from "react";
import {
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { useAccount, useSendTransaction } from "wagmi";
import { polygon } from "wagmi/chains";

type RawTx = {
  to: Address;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
};

type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
};

export type SendTxOptions = {
  /** When true, Privy shows its transaction confirmation modal (overrides provider default). */
  showWalletUIs?: boolean;
};

function isPrivyEmbeddedWallet(
  wallet: { walletClientType?: string; connectorType?: string } | undefined,
): boolean {
  if (!wallet) return false;
  const wt = wallet.walletClientType;
  return (
    wt === "privy" ||
    wt === "privy-v2" ||
    wallet.connectorType === "embedded"
  );
}

/**
 * Unified transaction sender that works for BOTH Privy-managed (embedded) and
 * external wallets.
 *
 * Embedded wallets must go through Privy's signing service via its own
 * `useSendTransaction`. Routing them through wagmi's connector emits a
 * `wallet_sendTransaction` RPC call that hits the read-only RPC node (which
 * rejects it with "Unsupported method"). External wallets keep using wagmi so
 * their own confirmation UX is preserved.
 */
function isPrivyWagmiConnector(connectorId: string | undefined): boolean {
  if (!connectorId) return false;
  const id = connectorId.toLowerCase();
  return id === "io.privy.wallet" || id.startsWith("io.privy.wallet.");
}

export function useTxSender() {
  const { address, connector } = useAccount();
  const { wallets } = useWallets();
  const { sendTransaction: privySend } = usePrivySendTransaction();
  const wagmiSend = useSendTransaction();

  const isEmbedded = useMemo(() => {
    if (!address) return false;
    // @privy-io/wagmi exposes embedded wallets as injected connectors like
    // io.privy.wallet.0x… — those must not use wagmi sendTransaction (chain ends
    // up undefined and the Privy provider rejects the call).
    if (isPrivyWagmiConnector(connector?.id)) return true;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (
      embedded?.address?.toLowerCase() === address.toLowerCase()
    ) {
      return true;
    }
    const active = wallets.find(
      (x) => x.address?.toLowerCase() === address.toLowerCase(),
    );
    return isPrivyEmbeddedWallet(active);
  }, [wallets, address, connector?.id]);

  const sendTx = useCallback(
    async (tx: RawTx, opts?: SendTxOptions): Promise<Hex> => {
      const showWalletUIs = opts?.showWalletUIs ?? false;
      if (isEmbedded && address) {
        const { hash } = await privySend(
          {
            to: tx.to,
            chainId: polygon.id,
            data: tx.data,
            value: tx.value ?? 0n,
            gasLimit: tx.gas,
          },
          { address, uiOptions: { showWalletUIs } },
        );
        return hash;
      }
      return wagmiSend.sendTransactionAsync({
        chainId: polygon.id,
        account: address,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
        gas: tx.gas,
      });
    },
    [isEmbedded, address, privySend, wagmiSend],
  );

  const writeContract = useCallback(
    async (call: WriteArgs, opts?: SendTxOptions): Promise<Hex> => {
      const data = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args ?? [],
      });
      return sendTx(
        {
          to: call.address,
          data,
          value: call.value,
          gas: call.gas,
        },
        opts,
      );
    },
    [sendTx],
  );

  return { sendTx, writeContract, isEmbedded };
}
