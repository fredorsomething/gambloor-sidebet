"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, maxUint256, type Address } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_ABI } from "@/lib/abi";
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

  const me = account?.toLowerCase();
  const isProposer = me === bet.proposer.toLowerCase();
  const isSettler = me === bet.settler.toLowerCase();
  const isAcceptor = bet.acceptor ? me === bet.acceptor.toLowerCase() : false;

  const amount = BigInt(bet.amount);
  const token = bet.token as Address;
  const escrow = bet.escrowAddress as Address;

  const live = useTokenInfo({
    token,
    owner: account,
    spender: escrow,
  });
  const decimals = live.decimals ?? bet.decimals;
  const tokenSym = bet.tokenSymbol || live.symbol || "tokens";

  const needsApproval =
    !!account && bet.status === "Open" && !isProposer && (live.allowance ?? 0n) < amount;

  // -------- approve + accept flow --------
  const approveTx = useWriteContract();
  const approveWait = useWaitForTransactionReceipt({ hash: approveTx.data });
  const acceptTx = useWriteContract();
  const acceptWait = useWaitForTransactionReceipt({ hash: acceptTx.data });
  const cancelTx = useWriteContract();
  const cancelWait = useWaitForTransactionReceipt({ hash: cancelTx.data });
  const settleTx = useWriteContract();
  const settleWait = useWaitForTransactionReceipt({ hash: settleTx.data });
  const refundTx = useWriteContract();
  const refundWait = useWaitForTransactionReceipt({ hash: refundTx.data });

  const [acceptStep, setAcceptStep] = useState<
    "idle" | "approving" | "accepting"
  >("idle");
  const acceptBusy = acceptStep !== "idle";

  async function onAccept() {
    if (!account) return;
    try {
      if (needsApproval) {
        setAcceptStep("approving");
        push({ title: "Approving token" });
        await approveTx.writeContractAsync({
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrow, maxUint256],
        });
      } else {
        setAcceptStep("accepting");
        push({ title: "Accepting bet" });
        await acceptTx.writeContractAsync({
          address: escrow,
          abi: SIDEBET_ESCROW_ABI,
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

  // After approval lands, automatically issue acceptBet.
  useEffect(() => {
    if (acceptStep !== "approving") return;
    if (!approveWait.isSuccess) return;
    void (async () => {
      try {
        setAcceptStep("accepting");
        push({ title: "Accepting bet" });
        await acceptTx.writeContractAsync({
          address: escrow,
          abi: SIDEBET_ESCROW_ABI,
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

  // -------- cancel --------
  async function onCancel() {
    try {
      await cancelTx.writeContractAsync({
        address: escrow,
        abi: SIDEBET_ESCROW_ABI,
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
      push({
        title: "Bet cancelled",
        description: "Stake refunded.",
        variant: "success",
      });
      onTxConfirmed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelWait.isSuccess]);

  // -------- settle --------
  const [winner, setWinner] = useState<"proposer" | "acceptor" | "push">(
    "proposer",
  );
  async function onSettle() {
    const winAddr =
      winner === "proposer"
        ? bet.proposer
        : winner === "acceptor"
          ? bet.acceptor ?? "0x0000000000000000000000000000000000000000"
          : "0x0000000000000000000000000000000000000000";
    try {
      await settleTx.writeContractAsync({
        address: escrow,
        abi: SIDEBET_ESCROW_ABI,
        functionName: "settleBet",
        args: [BigInt(bet.onchainId), getAddress(winAddr)],
      });
      push({ title: "Settle submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Settle rejected";
      push({ title: "Settle failed", description: msg, variant: "danger" });
    }
  }
  useEffect(() => {
    if (settleWait.isSuccess) {
      push({
        title: "Settled",
        description:
          winner === "push" ? "Push — both sides refunded." : "Winner paid.",
        variant: "success",
      });
      onTxConfirmed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleWait.isSuccess]);

  // -------- refund expired --------
  const canRefund = useMemo(() => {
    if (bet.status !== "Matched") return false;
    if (!bet.settleDeadline) return false;
    return Date.now() / 1000 >= Number(bet.settleDeadline);
  }, [bet.status, bet.settleDeadline]);

  async function onRefund() {
    try {
      await refundTx.writeContractAsync({
        address: escrow,
        abi: SIDEBET_ESCROW_ABI,
        functionName: "refundExpired",
        args: [BigInt(bet.onchainId)],
      });
      push({ title: "Refund submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Refund rejected";
      push({ title: "Refund failed", description: msg, variant: "danger" });
    }
  }
  useEffect(() => {
    if (refundWait.isSuccess) {
      push({
        title: "Refunded",
        description: "Both stakes returned.",
        variant: "success",
      });
      onTxConfirmed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundWait.isSuccess]);

  // ---- render ----
  if (!account) {
    return (
      <div className="card p-4 text-sm text-muted-foreground">
        Sign in to take action on this bet.
      </div>
    );
  }

  // Open + I'm not the proposer => can accept
  if (bet.status === "Open" && !isProposer) {
    return (
      <div className="card p-5 space-y-3">
        <LowGasBanner />
        <div>
          <h3 className="font-semibold">Take the other side</h3>
          <p className="text-sm text-muted-foreground">
            You'll stake{" "}
            <span className="font-mono">
              {formatToken(amount, decimals)} {tokenSym}
            </span>{" "}
            into escrow. Winner takes the pool less the settler fee (
            {(bet.feeBps / 100).toFixed(2)}%).
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
          {acceptStep === "idle" &&
            (needsApproval ? "Approve & accept" : "Accept bet")}
        </Button>
      </div>
    );
  }

  // Open + I'm the proposer => can cancel
  if (bet.status === "Open" && isProposer) {
    return (
      <div className="card p-5 space-y-3">
        <LowGasBanner />
        <h3 className="font-semibold">Your open offer</h3>
        <p className="text-sm text-muted-foreground">
          No taker yet. You can cancel to pull your stake back.
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

  // Matched + I'm the settler => can settle
  if (bet.status === "Matched" && isSettler) {
    return (
      <div className="card p-5 space-y-4">
        <LowGasBanner />
        <div>
          <h3 className="font-semibold">Settle market</h3>
          <p className="text-sm text-muted-foreground">
            Read the terms carefully. Declaring a winner pays out{" "}
            <span className="font-mono">
              {formatToken(amount * 2n, decimals)} {tokenSym}
            </span>{" "}
            less your {(bet.feeBps / 100).toFixed(2)}% fee. Picking{" "}
            <em>push</em> refunds both sides.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {(
            [
              {
                key: "proposer" as const,
                label: `Proposer wins (${shortAddr(bet.proposer)})`,
              },
              {
                key: "acceptor" as const,
                label: `Acceptor wins (${shortAddr(bet.acceptor ?? "")})`,
              },
              { key: "push" as const, label: "Push — split refund" },
            ]
          ).map((opt) => (
            <label
              key={opt.key}
              className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer text-sm ${
                winner === opt.key
                  ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10"
                  : "border-border"
              }`}
            >
              <input
                type="radio"
                name="winner"
                checked={winner === opt.key}
                onChange={() => setWinner(opt.key)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        <Button
          onClick={onSettle}
          disabled={settleTx.isPending || settleWait.isLoading}
          size="lg"
        >
          {settleWait.isLoading ? "Settling…" : "Settle market"}
        </Button>
      </div>
    );
  }

  // Matched + past settleDeadline => anyone can refund
  if (bet.status === "Matched" && canRefund) {
    return (
      <div className="card p-5 space-y-3">
        <LowGasBanner />
        <h3 className="font-semibold">Settle deadline passed</h3>
        <p className="text-sm text-muted-foreground">
          The settler did not resolve before the deadline. Either party (or
          anyone) can now refund both stakes.
        </p>
        <Button
          onClick={onRefund}
          variant="outline"
          disabled={refundTx.isPending || refundWait.isLoading}
        >
          {refundWait.isLoading ? "Refunding…" : "Refund both stakes"}
        </Button>
      </div>
    );
  }

  // Matched + waiting on settler => no action for you
  if (bet.status === "Matched") {
    return (
      <div className="card p-5 text-sm">
        <h3 className="font-semibold">Awaiting settlement</h3>
        <p className="text-muted-foreground mt-1">
          Both sides are funded. Settler{" "}
          <span className="font-mono">{shortAddr(bet.settler)}</span> will
          resolve the market.
        </p>
      </div>
    );
  }

  // Resolved states.
  if (bet.status === "Settled" && bet.winner) {
    const winnerLabel =
      bet.winner.toLowerCase() === bet.proposer.toLowerCase()
        ? "Proposer"
        : bet.acceptor &&
            bet.winner.toLowerCase() === bet.acceptor.toLowerCase()
          ? "Acceptor"
          : "Unknown";
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Resolved</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {winnerLabel} won.{" "}
          <span className="font-mono">{shortAddr(bet.winner)}</span> received{" "}
          {formatToken(
            (amount * 2n * BigInt(10000 - bet.feeBps)) / 10000n,
            decimals,
          )}{" "}
          {tokenSym}.
        </p>
      </div>
    );
  }

  if (bet.status === "Settled" && !bet.winner) {
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Push</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Settler declared a push. Both sides were refunded.
        </p>
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
          Settler did not resolve in time. Both stakes were returned.
        </p>
      </div>
    );
  }

  return null;
}
