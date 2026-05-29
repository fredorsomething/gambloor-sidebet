"use client";

import { useEffect, useState } from "react";
import { maxUint256, type Address } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { formatToken, shortAddr } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

type Props = {
  bet: BetRow;
  onTxConfirmed?: () => void;
};

export function BetActions({ bet, onTxConfirmed }: Props) {
  const { address: account } = useAccount();
  const { push } = useToast();
  const ensurePolygon = useEnsurePolygon();

  const me = account?.toLowerCase();
  const isProposer = me === bet.proposer.toLowerCase();
  const isSettler = me === bet.settler.toLowerCase();

  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const pool = proposerStake + acceptorStake;
  const token = bet.token as Address;
  const escrow = bet.escrowAddress as Address;

  const live = useTokenInfo({ token, owner: account, spender: escrow });
  const decimals = live.decimals ?? bet.decimals;
  const tokenSym = bet.tokenSymbol || live.symbol || "tokens";

  // Acceptor must stake the acceptorStake amount.
  const needsApproval =
    !!account &&
    bet.status === "Open" &&
    !isProposer &&
    (live.allowance ?? 0n) < acceptorStake;

  const approveTx = useWriteContract();
  const approveWait = useWaitForTransactionReceipt({ hash: approveTx.data });
  const acceptTx = useWriteContract();
  const acceptWait = useWaitForTransactionReceipt({ hash: acceptTx.data });
  const cancelTx = useWriteContract();
  const cancelWait = useWaitForTransactionReceipt({ hash: cancelTx.data });
  const settleTx = useWriteContract();
  const settleWait = useWaitForTransactionReceipt({ hash: settleTx.data });

  const [acceptStep, setAcceptStep] = useState<"idle" | "approving" | "accepting">(
    "idle",
  );
  const acceptBusy = acceptStep !== "idle";

  async function onAccept() {
    if (!account) return;
    try {
      await ensurePolygon();
      if (needsApproval) {
        setAcceptStep("approving");
        push({ title: "Approving token" });
        await approveTx.writeContractAsync({
          chainId: polygon.id,
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrow, maxUint256],
        });
      } else {
        setAcceptStep("accepting");
        push({ title: "Accepting bet" });
        await acceptTx.writeContractAsync({
          chainId: polygon.id,
          address: escrow,
          abi: SIDEBET_ESCROW_V2_ABI,
          functionName: "acceptBet",
          args: [BigInt(bet.onchainId)],
        });
      }
    } catch (err) {
      setAcceptStep("idle");
      const msg = (err as Error)?.message || "Cancelled";
      push({ title: "Transaction failed", description: msg, variant: "danger" });
    }
  }

  useEffect(() => {
    if (acceptStep !== "approving") return;
    if (!approveWait.isSuccess) return;
    void (async () => {
      try {
        setAcceptStep("accepting");
        push({ title: "Accepting bet" });
        await acceptTx.writeContractAsync({
          chainId: polygon.id,
          address: escrow,
          abi: SIDEBET_ESCROW_V2_ABI,
          functionName: "acceptBet",
          args: [BigInt(bet.onchainId)],
        });
      } catch (err) {
        setAcceptStep("idle");
        const msg = (err as Error)?.message || "Cancelled";
        push({ title: "Accept failed", description: msg, variant: "danger" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptStep, approveWait.isSuccess]);

  useEffect(() => {
    if (acceptStep !== "accepting") return;
    if (!acceptWait.isSuccess) return;
    setAcceptStep("idle");
    push({
      title: "Bet matched",
      description: "Both sides funded. Awaiting settlement.",
      variant: "success",
    });
    onTxConfirmed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptStep, acceptWait.isSuccess]);

  async function onCancel() {
    try {
      await ensurePolygon();
      await cancelTx.writeContractAsync({
        chainId: polygon.id,
        address: escrow,
        abi: SIDEBET_ESCROW_V2_ABI,
        functionName: "cancelBet",
        args: [BigInt(bet.onchainId)],
      });
      push({ title: "Cancel submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Cancel rejected";
      push({ title: "Cancel failed", description: msg, variant: "danger" });
    }
  }
  useEffect(() => {
    if (cancelWait.isSuccess) {
      push({ title: "Bet cancelled", description: "Stake refunded.", variant: "success" });
      onTxConfirmed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelWait.isSuccess]);

  // -------- settle: pick the winning outcome --------
  const [winningOutcome, setWinningOutcome] = useState<number>(
    bet.proposerOutcome ?? 0,
  );
  async function onSettle() {
    try {
      await ensurePolygon();
      await settleTx.writeContractAsync({
        chainId: polygon.id,
        address: escrow,
        abi: SIDEBET_ESCROW_V2_ABI,
        functionName: "settleBet",
        args: [BigInt(bet.onchainId), winningOutcome],
      });
      push({ title: "Settle submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Settle rejected";
      push({ title: "Settle failed", description: msg, variant: "danger" });
    }
  }
  useEffect(() => {
    if (settleWait.isSuccess) {
      push({ title: "Settled", description: "Outcome declared.", variant: "success" });
      onTxConfirmed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleWait.isSuccess]);

  const feePct = (bet.feeBps / 100).toFixed(2);
  const payout = (pool * BigInt(10000 - bet.feeBps)) / 10000n;

  if (!account) {
    return (
      <div className="card p-4 text-sm text-muted-foreground">
        Sign in to take action on this bet.
      </div>
    );
  }

  // Open + I'm not the proposer => can accept.
  if (bet.status === "Open" && !isProposer) {
    const theirPick = outcomes[bet.acceptorOutcome];
    return (
      <div className="card p-5 space-y-3">
        <LowGasBanner />
        <div>
          <h3 className="font-semibold">Take the other side</h3>
          <p className="text-sm text-muted-foreground">
            You'll back{" "}
            <span className="font-semibold text-danger">{theirPick ?? "the other outcome"}</span>{" "}
            and stake{" "}
            <span className="font-mono">
              {formatToken(acceptorStake, decimals)} {tokenSym}
            </span>{" "}
            into escrow. If your outcome wins, you take the{" "}
            {formatToken(pool, decimals)} {tokenSym} pool less the {feePct}% settler fee.
          </p>
        </div>
        {live.balance !== undefined && (
          <div className="text-xs text-muted-foreground">
            Your balance:{" "}
            <span className="font-mono">
              {formatToken(live.balance, decimals)} {tokenSym}
            </span>
          </div>
        )}
        <Button onClick={onAccept} disabled={acceptBusy} size="lg">
          {acceptStep === "approving" && "Approving…"}
          {acceptStep === "accepting" && "Accepting…"}
          {acceptStep === "idle" && (needsApproval ? "Approve & accept" : "Accept bet")}
        </Button>
      </div>
    );
  }

  // Open + I'm the proposer => can cancel.
  if (bet.status === "Open" && isProposer) {
    return (
      <div className="card p-5 space-y-3">
        <LowGasBanner />
        <h3 className="font-semibold">Your open offer</h3>
        <p className="text-sm text-muted-foreground">
          No taker yet. You can cancel to pull your{" "}
          {formatToken(proposerStake, decimals)} {tokenSym} stake back.
        </p>
        <Button
          variant="danger"
          onClick={onCancel}
          disabled={cancelTx.isPending || cancelWait.isLoading}
        >
          {cancelWait.isLoading ? "Cancelling…" : "Cancel & refund"}
        </Button>
      </div>
    );
  }

  // Matched + I'm the settler => can settle by picking the winning outcome.
  if (bet.status === "Matched" && isSettler) {
    return (
      <div className="card p-5 space-y-4">
        <LowGasBanner />
        <div>
          <h3 className="font-semibold">Settle market</h3>
          <p className="text-sm text-muted-foreground">
            Read the terms carefully and declare the winning outcome. The pool of{" "}
            <span className="font-mono">
              {formatToken(pool, decimals)} {tokenSym}
            </span>{" "}
            pays the winning side less your {feePct}% fee. If you pick an outcome
            nobody backed, both sides are refunded (no fee).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {outcomes.map((label, i) => {
            const backedBy =
              i === bet.proposerOutcome
                ? "Proposer"
                : i === bet.acceptorOutcome
                  ? "Acceptor"
                  : "Nobody (refund)";
            return (
              <label
                key={i}
                className={`flex items-center justify-between gap-2 rounded-md border p-3 cursor-pointer text-sm ${
                  winningOutcome === i
                    ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10"
                    : "border-border"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="winningOutcome"
                    checked={winningOutcome === i}
                    onChange={() => setWinningOutcome(i)}
                  />
                  <span className="font-medium">{label}</span>
                </span>
                <span className="text-xs text-muted-foreground">{backedBy}</span>
              </label>
            );
          })}
        </div>
        <Button
          onClick={onSettle}
          disabled={settleTx.isPending || settleWait.isLoading}
          size="lg"
        >
          {settleWait.isLoading ? "Settling…" : "Declare winning outcome"}
        </Button>
      </div>
    );
  }

  // Matched + waiting on settler.
  if (bet.status === "Matched") {
    return (
      <div className="card p-5 text-sm">
        <h3 className="font-semibold">Awaiting settlement</h3>
        <p className="text-muted-foreground mt-1">
          Both sides are funded. Settler{" "}
          <span className="font-mono">{shortAddr(bet.settler)}</span> will declare
          the winning outcome.
        </p>
      </div>
    );
  }

  // Settled.
  if (bet.status === "Settled") {
    const win = bet.winningOutcome;
    const winLabel = win != null ? outcomes[win] : undefined;
    const refunded =
      win != null && win !== bet.proposerOutcome && win !== bet.acceptorOutcome;
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Resolved</h3>
        {refunded ? (
          <p className="text-sm text-muted-foreground mt-1">
            Winning outcome <b>{winLabel}</b> was backed by neither side — both
            stakes were refunded.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            Winning outcome: <b>{winLabel ?? "—"}</b>.{" "}
            {bet.winner && (
              <>
                <span className="font-mono">{shortAddr(bet.winner)}</span> received{" "}
                {formatToken(payout, decimals)} {tokenSym}.
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  if (bet.status === "Cancelled") {
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Cancelled</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Proposer cancelled before a taker accepted.
        </p>
      </div>
    );
  }

  if (bet.status === "Refunded") {
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Refunded</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Both stakes were returned.
        </p>
      </div>
    );
  }

  return null;
}
