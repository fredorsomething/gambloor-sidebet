"use client";

import {
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
export function useTxSender() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { sendTransaction: privySend } = usePrivySendTransaction();
  const wagmiSend = useSendTransaction();

  const isEmbedded = useMemo(() => {
    const w =
      wallets.find(
        (x) => x.address?.toLowerCase() === address?.toLowerCase(),
      ) ?? wallets[0];
    return w?.connectorType === "embedded" || w?.walletClientType === "privy";
  }, [wallets, address]);

  const sendTx = useCallback(
    async (tx: RawTx): Promise<Hex> => {
      if (isEmbedded && address) {
        const { hash } = await privySend(
          {
            to: tx.to,
            chainId: polygon.id,
            data: tx.data,
            value: tx.value ?? 0n,
            gasLimit: tx.gas,
          },
          { address, uiOptions: { showWalletUIs: false } },
        );
        return hash;
      }
      return wagmiSend.sendTransactionAsync({
        chainId: polygon.id,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
        gas: tx.gas,
      });
    },
    [isEmbedded, address, privySend, wagmiSend],
  );

  const writeContract = useCallback(
    async (call: WriteArgs): Promise<Hex> => {
      const data = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args ?? [],
      });
      return sendTx({
        to: call.address,
        data,
        value: call.value,
        gas: call.gas,
      });
    },
    [sendTx],
  );

  return { sendTx, writeContract, isEmbedded };
}
