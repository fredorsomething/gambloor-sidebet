"use client";

import { useEffect, useState } from "react";
import { maxUint256, type Address, type Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { formatToken, shortAddr } from "@/lib/utils";
import type { BetRow, GetBetResponse } from "@/lib/types";

const ZERO = "0x0000000000000000000000000000000000000000";
const WEEK_SECONDS = 7 * 24 * 60 * 60;

type Props = {
  bet: BetRow;
  /** Live on-chain snapshot from the bet endpoint; the source of truth for
   *  status/acceptor so stale off-chain data never shows the wrong action. */
  onchain?: GetBetResponse["onchain"];
  onTxConfirmed?: () => void;
};

export function BetActions({ bet, onchain, onTxConfirmed }: Props) {
  const { address: account } = useAccount();
  const { push } = useToast();
  const ensurePolygon = useEnsurePolygon();

  const me = account?.toLowerCase();
  const isProposer = me === bet.proposer.toLowerCase();
  const isSettler = me === bet.settler.toLowerCase();

  // Prefer on-chain truth over the indexed snapshot (which can lag behind).
  const rawStatus = onchain?.status ?? bet.status;
  const acceptorAddr =
    onchain?.acceptor && onchain.acceptor !== ZERO
      ? onchain.acceptor
      : bet.acceptor;
  const hasAcceptor = !!acceptorAddr && acceptorAddr.toLowerCase() !== ZERO;
  // Once a taker exists the bet is matched — never allow cancel/take again, even
  // if the indexed status hasn't caught up to the chain yet.
  const status = rawStatus === "Open" && hasAcceptor ? "Matched" : rawStatus;
  const isAcceptor = !!me && hasAcceptor && me === acceptorAddr!.toLowerCase();

  // A still-open offer with no taker is "expired" once its accept window passes.
  // New bets carry a 1-week acceptDeadline; older ones fall back to created+1wk.
  const createdSec = Math.floor(new Date(bet.createdAt).getTime() / 1000);
  const deadlineSec = bet.acceptDeadline
    ? Number(bet.acceptDeadline)
    : createdSec + WEEK_SECONDS;
  const expired = status === "Open" && Math.floor(Date.now() / 1000) > deadlineSec;

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
    status === "Open" &&
    !isProposer &&
    !isAcceptor &&
    (live.allowance ?? 0n) < acceptorStake;

  const { writeContract } = useTxSender();
  const [approveHash, setApproveHash] = useState<Hex>();
  const [acceptHash, setAcceptHash] = useState<Hex>();
  const [cancelHash, setCancelHash] = useState<Hex>();
  const [settleHash, setSettleHash] = useState<Hex>();
  const approveWait = useWaitForTransactionReceipt({ hash: approveHash });
  const acceptWait = useWaitForTransactionReceipt({ hash: acceptHash });
  const cancelWait = useWaitForTransactionReceipt({ hash: cancelHash });
  const settleWait = useWaitForTransactionReceipt({ hash: settleHash });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [settleBusy, setSettleBusy] = useState(false);

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
        const hash = await writeContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrow, maxUint256],
        });
        setApproveHash(hash);
      } else {
        setAcceptStep("accepting");
        push({ title: "Accepting bet" });
        const hash = await writeContract({
          address: escrow,
          abi: SIDEBET_ESCROW_V2_ABI,
          functionName: "acceptBet",
          args: [BigInt(bet.onchainId)],
        });
        setAcceptHash(hash);
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
        const hash = await writeContract({
          address: escrow,
          abi: SIDEBET_ESCROW_V2_ABI,
          functionName: "acceptBet",
          args: [BigInt(bet.onchainId)],
        });
        setAcceptHash(hash);
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
    setCancelBusy(true);
    try {
      await ensurePolygon();
      const hash = await writeContract({
        address: escrow,
        abi: SIDEBET_ESCROW_V2_ABI,
        functionName: "cancelBet",
        args: [BigInt(bet.onchainId)],
      });
      setCancelHash(hash);
      push({ title: "Cancel submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Cancel rejected";
      push({ title: "Cancel failed", description: msg, variant: "danger" });
    } finally {
      setCancelBusy(false);
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
    setSettleBusy(true);
    try {
      await ensurePolygon();
      const hash = await writeContract({
        address: escrow,
        abi: SIDEBET_ESCROW_V2_ABI,
        functionName: "settleBet",
        args: [BigInt(bet.onchainId), winningOutcome],
      });
      setSettleHash(hash);
      push({ title: "Settle submitted" });
    } catch (err) {
      const msg = (err as Error)?.message || "Settle rejected";
      push({ title: "Settle failed", description: msg, variant: "danger" });
    } finally {
      setSettleBusy(false);
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

  // Expired open offer (no taker within the accept window).
  if (status === "Open" && expired) {
    if (isProposer) {
      return (
        <div className="card p-5 space-y-3 ring-1 ring-warning/30">
          <LowGasBanner />
          <h3 className="font-semibold">Offer expired</h3>
          <p className="text-sm text-muted-foreground">
            No one took this bet within a week, so it&apos;s closed to new takers.
            Reclaim your {formatToken(proposerStake, decimals)} {tokenSym} stake.
          </p>
          <Button
            variant="danger"
            onClick={onCancel}
            disabled={cancelBusy || cancelWait.isLoading}
            className="w-full"
          >
            {cancelWait.isLoading ? "Reclaiming…" : "Reclaim my stake"}
          </Button>
        </div>
      );
    }
    return (
      <div className="card p-5 text-sm">
        <h3 className="font-semibold">Offer expired</h3>
        <p className="mt-1 text-muted-foreground">
          This offer wasn&apos;t taken within a week and is no longer available.
          The proposer can reclaim their stake.
        </p>
      </div>
    );
  }

  // Open + I'm not the proposer => can accept.
  if (status === "Open" && !isProposer && !isAcceptor) {
    const theirPick = outcomes[bet.acceptorOutcome];
    return (
      <div className="card p-5 space-y-4 ring-1 ring-primary/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Take this bet</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Back{" "}
              <span className="font-semibold text-danger">
                {theirPick ?? "the other outcome"}
              </span>{" "}
              against the proposer.
            </p>
          </div>
          <Button
            onClick={onAccept}
            disabled={acceptBusy}
            size="lg"
            className="w-full shrink-0 sm:w-auto sm:px-8"
          >
            {acceptStep === "approving" && "Approving…"}
            {acceptStep === "accepting" && "Accepting…"}
            {acceptStep === "idle" &&
              (needsApproval ? "Approve & take bet" : "Take bet")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-3">
          <div>
            <div className="label">You stake</div>
            <div className="mt-0.5 inline-flex items-center font-mono text-base font-bold">
              {formatToken(acceptorStake, decimals)}{" "}
              <TokenSymbol
                symbol={tokenSym}
                size={12}
                className="ml-1 text-xs font-normal text-muted-foreground"
              />
            </div>
          </div>
          <div>
            <div className="label">You win</div>
            <div className="mt-0.5 inline-flex items-center font-mono text-base font-bold text-success">
              {formatToken(payout, decimals)}{" "}
              <TokenSymbol
                symbol={tokenSym}
                size={12}
                className="ml-1 text-xs font-normal text-muted-foreground"
              />
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="label">Settler fee</div>
            <div className="mt-0.5 font-mono text-base">{feePct}%</div>
          </div>
        </div>

        {live.balance !== undefined && (
          <div className="text-xs text-muted-foreground">
            Your balance:{" "}
            <span className="inline-flex items-center gap-1 font-mono">
              {formatToken(live.balance, decimals)}
              <TokenSymbol symbol={tokenSym} size={11} />
            </span>
          </div>
        )}
        <LowGasBanner />
      </div>
    );
  }

  // Open + I'm the proposer => can cancel.
  if (status === "Open" && isProposer) {
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
          disabled={cancelBusy || cancelWait.isLoading}
          className="w-full"
        >
          {cancelWait.isLoading ? "Cancelling…" : "Cancel & refund"}
        </Button>
      </div>
    );
  }

  // Matched + I'm the settler => can settle by picking the winning outcome.
  if (status === "Matched" && isSettler) {
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
          disabled={settleBusy || settleWait.isLoading}
          size="lg"
          className="w-full"
        >
          {settleWait.isLoading ? "Settling…" : "Declare winning outcome"}
        </Button>
      </div>
    );
  }

  // Matched + waiting on settler.
  if (status === "Matched") {
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
  if (status === "Settled") {
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

  if (status === "Cancelled") {
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Cancelled</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Proposer cancelled before a taker accepted.
        </p>
      </div>
    );
  }

  if (status === "Refunded") {
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
