"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
} from "wagmi";
import { decodeEventLog } from "viem";

import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { useToast } from "@/components/ui/Toast";
import { SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { cryptoErrorSummary, formatCryptoError } from "@/lib/cryptoErrors";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { jsonFetch } from "@/lib/fetcher";
import { formatToken } from "@/lib/utils";
import type { BetRow, GetBetResponse } from "@/lib/types";

const WEEK_SECONDS = 7 * 24 * 60 * 60;

type Props = {
  bet: BetRow;
  onchain?: GetBetResponse["onchain"];
  onDone?: () => void;
};

/**
 * After a counter-offer is accepted, the proposer publishes a fresh on-chain
 * offer on the same indexed bet (new escrow id) instead of creating a duplicate.
 */
export function ReviseBetEscrow({ bet, onchain, onDone }: Props) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const ensurePolygon = useEnsurePolygon();
  const { writeContract } = useTxSender();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<
    "idle" | "cancelling" | "creating" | "indexing"
  >("idle");
  const [cancelHash, setCancelHash] = useState<Hex>();
  const [createHash, setCreateHash] = useState<Hex>();
  const cancelWait = useWaitForTransactionReceipt({ hash: cancelHash });
  const createWait = useWaitForTransactionReceipt({ hash: createHash });

  const me = address?.toLowerCase();
  const isProposer = !!me && me === bet.proposer.toLowerCase();

  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const token = bet.token as Address;
  const escrow = bet.escrowAddress as Address;
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];

  const live = useTokenInfo({ token, owner: address, spender: escrow });
  const decimals = live.decimals ?? bet.decimals;
  const tokenSym = bet.tokenSymbol || live.symbol || "tokens";

  const needsCancel = onchain?.status === "Open";

  const createParams = useMemo(() => {
    const endDate = bet.estimatedEndDate
      ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
      : 0;
    const acceptDeadline = Math.floor(Date.now() / 1000) + WEEK_SECONDS;
    return {
      acceptDeadline,
      estimatedEndDate: endDate,
      termsHash: bet.termsHash as Hex,
    };
  }, [bet.estimatedEndDate, bet.termsHash]);

  async function authHeader() {
    const token = await getAccessToken();
    if (!token) throw new Error("Your session expired. Please sign in again.");
    return { Authorization: `Bearer ${token}` };
  }

  async function runCreate() {
    if (!address) return;
    setStep("creating");
    push({
      title: "Publishing updated offer",
      description: "Confirm the transaction in your wallet.",
    });
    await ensurePolygon();
    const hash = await writeContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "createBet",
      args: [
        getAddress(bet.settler),
        token,
        proposerStake,
        acceptorStake,
        bet.proposerOutcome,
        bet.acceptorOutcome,
        outcomes.length,
        BigInt(createParams.acceptDeadline),
        BigInt(createParams.estimatedEndDate),
        createParams.termsHash,
      ],
    });
    setCreateHash(hash);
  }

  async function onPublish() {
    if (!address || !isProposer) return;
    try {
      if (needsCancel) {
        setStep("cancelling");
        push({
          title: "Cancelling old offer",
          description: "Reclaiming your stake from the previous on-chain offer.",
        });
        await ensurePolygon();
        const hash = await writeContract({
          address: escrow,
          abi: SIDEBET_ESCROW_V2_ABI,
          functionName: "cancelBet",
          args: [BigInt(bet.onchainId)],
        });
        setCancelHash(hash);
      } else {
        await runCreate();
      }
    } catch (err) {
      setStep("idle");
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Couldn't update offer",
      });
      push({ title, description, variant: "danger" });
    }
  }

  useEffect(() => {
    if (step !== "cancelling" || !cancelWait.isSuccess) return;
    void runCreate().catch((err) => {
      setStep("idle");
      push({
        title: "Couldn't publish offer",
        description: cryptoErrorSummary(err, "Create failed"),
        variant: "danger",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cancelWait.isSuccess]);

  useEffect(() => {
    if (step !== "creating" || !createWait.isSuccess || !createHash) return;
    if (!address || !publicClient) return;
    void (async () => {
      setStep("indexing");
      try {
        const receipt =
          createWait.data ??
          (await publicClient.waitForTransactionReceipt({ hash: createHash }));

        let onchainId: bigint | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: SIDEBET_ESCROW_V2_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "BetCreated") {
              onchainId = (decoded.args as { id: bigint }).id;
              break;
            }
          } catch {
            /* skip */
          }
        }
        if (onchainId === null) {
          throw new Error("Couldn't find BetCreated in receipt");
        }

        const headers = await authHeader();
        await jsonFetch(`/api/bets/${bet.id}/revise-escrow`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            actor: address,
            onchainId: onchainId.toString(),
            txHash: createHash,
            termsHash: bet.termsHash,
            nonce: bet.nonce,
            proposerStake: bet.proposerStake || bet.amount,
            acceptorStake: bet.acceptorStake || bet.amount,
            acceptDeadline: createParams.acceptDeadline,
          }),
        });

        setStep("idle");
        push({
          title: "Offer updated",
          description: "Same sidebet — new on-chain stakes are live.",
          variant: "success",
        });
        onDone?.();
      } catch (err) {
        setStep("idle");
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't save update",
        });
        push({ title, description, variant: "danger" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, createWait.isSuccess, createHash]);

  if (!isProposer || !bet.escrowRevisionNeeded) return null;

  const busy = step !== "idle";

  return (
    <section
      id="revise-escrow"
      className="card border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 p-5 space-y-3 scroll-mt-24"
    >
      <h3 className="text-sm font-semibold">Publish locked-in terms</h3>
      <p className="text-sm text-muted-foreground">
        Agreed terms are saved on this sidebet. Confirm below to swap in the new
        on-chain stakes — this listing stays the same; your wallet may ask for
        one or two confirmations.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          You stake{" "}
          <span className="font-mono font-semibold">
            {formatToken(proposerStake, decimals)}
          </span>{" "}
          <TokenSymbol symbol={tokenSym} size={12} />
        </span>
        <span>
          They stake{" "}
          <span className="font-mono font-semibold">
            {formatToken(acceptorStake, decimals)}
          </span>{" "}
          <TokenSymbol symbol={tokenSym} size={12} />
        </span>
      </div>
      <Button onClick={onPublish} disabled={busy}>
        {busy
          ? step === "cancelling"
            ? "Cancelling old offer…"
            : step === "creating"
              ? "Confirm in wallet…"
              : "Saving…"
          : needsCancel
            ? "Publish agreed stakes"
            : "Publish on-chain offer"}
      </Button>
    </section>
  );
}
