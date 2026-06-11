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
import { mainnet, polygon } from "@/lib/viemChains";

import { ETHEREUM_CHAIN_ID, POLYGON_CHAIN_ID } from "@/lib/chains";
import { isPrivyEmbeddedWallet } from "@/lib/privyWallets";

function resolveTxChainId(chainId?: number) {
  const id = chainId ?? POLYGON_CHAIN_ID;
  return id === ETHEREUM_CHAIN_ID ? mainnet.id : polygon.id;
}

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
  /** Target chain for the transaction (defaults to Polygon). */
  chainId?: number;
  /**
   * Privy native gas sponsorship (POL on Polygon). Defaults to true for embedded
   * wallets when unset — requires App pays + client sponsorship in the dashboard.
   */
  sponsor?: boolean;
};

function isPrivyWagmiConnector(connectorId: string | undefined): boolean {
  if (!connectorId) return false;
  const id = connectorId.toLowerCase();
  return id === "io.privy.wallet" || id.startsWith("io.privy.wallet.");
}

/**
 * Unified transaction sender.
 *
 * Privy gas sponsorship only applies to embedded wallets (`sponsor: true` on
 * `useSendTransaction`). External wallets (MetaMask, Phantom, etc.) always pay
 * their own POL — wagmi is used as a fallback when no embedded wallet exists.
 */
export function useTxSender() {
  const { address, connector } = useAccount();
  const { wallets } = useWallets();
  const { sendTransaction: privySend } = usePrivySendTransaction();
  const wagmiSend = useSendTransaction();

  const embeddedWallet = useMemo(
    () => getEmbeddedConnectedWallet(wallets),
    [wallets],
  );

  const canUseSponsoredGas = !!embeddedWallet?.address;

  const isEmbedded = useMemo(() => {
    if (!address || !embeddedWallet?.address) return false;
    if (embeddedWallet.address.toLowerCase() === address.toLowerCase()) {
      return true;
    }
    if (isPrivyWagmiConnector(connector?.id)) return true;
    const wallet = wallets.find(
      (w) => w.address?.toLowerCase() === address.toLowerCase(),
    );
    return isPrivyEmbeddedWallet(wallet);
  }, [wallets, address, connector?.id, embeddedWallet]);

  const isExternalWalletActive = useMemo(() => {
    if (!address || !embeddedWallet?.address) return false;
    return address.toLowerCase() !== embeddedWallet.address.toLowerCase();
  }, [address, embeddedWallet]);

  const sendTx = useCallback(
    async (tx: RawTx, opts?: SendTxOptions): Promise<Hex> => {
      const showWalletUIs = opts?.showWalletUIs ?? false;
      const chainId = resolveTxChainId(opts?.chainId);
      const sponsor = opts?.sponsor ?? true;
      const signingAddress = embeddedWallet?.address as Address | undefined;

      if (signingAddress) {
        const { hash } = await privySend(
          {
            to: tx.to,
            chainId,
            data: tx.data,
            value: tx.value ?? 0n,
            // 0x / wagmi gas estimates assume an EOA payer — let Privy quote
            // sponsored gas instead when using native gas sponsorship.
            ...(sponsor ? {} : tx.gas ? { gasLimit: tx.gas } : {}),
          },
          {
            address: signingAddress,
            sponsor,
            uiOptions: { showWalletUIs },
          },
        );
        return hash;
      }

      return wagmiSend.sendTransactionAsync({
        chainId,
        account: address,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
        gas: tx.gas,
      });
    },
    [embeddedWallet, address, privySend, wagmiSend],
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

  return {
    sendTx,
    writeContract,
    isEmbedded,
    embeddedWallet,
    canUseSponsoredGas,
    isExternalWalletActive,
  };
}
