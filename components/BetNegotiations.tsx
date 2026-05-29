"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Handshake } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Identity } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { formatToken, parseAmount } from "@/lib/utils";
import type { BetRow } from "@/lib/types";

export const RELAUNCH_KEY = "sidebet:relaunch";

type Negotiation = {
  id: number;
  betId: number;
  fromAddress: string;
  proposerStake: string;
  acceptorStake: string;
  terms: string | null;
  message: string | null;
  status: "Pending" | "Accepted" | "Declined" | "Withdrawn";
  createdAt: string;
};

type ListResponse = {
  isProposer: boolean;
  proposer: string;
  status: string;
  negotiations: Negotiation[];
};

function fullAmount(wei: string, decimals: number): string {
  try {
    return formatUnits(BigInt(wei), decimals);
  } catch {
    return "0";
  }
}

export function BetNegotiations({ bet }: { bet: BetRow }) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const router = useRouter();
  const qc = useQueryClient();

  const me = address?.toLowerCase();
  const isProposer = !!me && me === bet.proposer.toLowerCase();
  const decimals = bet.decimals;
  const tokenSym = bet.tokenSymbol || "tokens";

  const queryKey = ["betNegotiations", bet.id, me ?? "anon"];
  const { data } = useQuery<ListResponse>({
    queryKey,
    queryFn: () =>
      jsonFetch(
        `/api/bets/${bet.id}/negotiations${me ? `?viewer=${me}` : ""}`,
      ),
    refetchInterval: 15_000,
    enabled: !!me,
  });

  const negotiations = data?.negotiations ?? [];

  async function authHeader() {
    const token = await getAccessToken();
    if (!token) throw new Error("Your session expired. Please sign in again.");
    return { Authorization: `Bearer ${token}` };
  }

  // -------- send a counter-offer (non-proposer) --------
  const [open, setOpen] = useState(false);
  const [proposerStakeStr, setProposerStakeStr] = useState(() =>
    fullAmount(bet.proposerStake || bet.amount || "0", decimals),
  );
  const [acceptorStakeStr, setAcceptorStakeStr] = useState(() =>
    fullAmount(bet.acceptorStake || bet.amount || "0", decimals),
  );
  const [terms, setTerms] = useState("");
  const [message, setMessage] = useState("");

  const sendOffer = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      let proposerStake: bigint;
      let acceptorStake: bigint;
      try {
        proposerStake = parseAmount(proposerStakeStr, decimals);
        acceptorStake = parseAmount(acceptorStakeStr, decimals);
      } catch {
        throw new Error("Enter valid stake amounts");
      }
      if (proposerStake <= 0n || acceptorStake <= 0n) {
        throw new Error("Stakes must be positive");
      }
      const headers = await authHeader();
      return jsonFetch(`/api/bets/${bet.id}/negotiations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: address,
          proposerStake: proposerStake.toString(),
          acceptorStake: acceptorStake.toString(),
          terms: terms.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      push({ title: "Offer sent", description: "The proposer has been notified.", variant: "success" });
      setOpen(false);
      setTerms("");
      setMessage("");
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      push({ title: "Couldn't send offer", description: (e as Error).message, variant: "danger" }),
  });

  // -------- respond to / withdraw an offer --------
  const respond = useMutation({
    mutationFn: async (vars: { id: number; action: "accept" | "decline" | "withdraw" }) => {
      if (!address) throw new Error("Connect a wallet first");
      const headers = await authHeader();
      return jsonFetch(`/api/bets/${bet.id}/negotiations/${vars.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ actor: address, action: vars.action }),
      });
    },
    onSuccess: (_res, vars) => {
      const label =
        vars.action === "accept" ? "accepted" : vars.action === "decline" ? "declined" : "withdrawn";
      push({ title: `Offer ${label}`, variant: "success" });
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      push({ title: "Action failed", description: (e as Error).message, variant: "danger" }),
  });

  function relaunchWith(n: Negotiation) {
    const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
    const endDate = bet.estimatedEndDate
      ? new Date(bet.estimatedEndDate).toISOString().slice(0, 10)
      : "";
    const payload = {
      title: bet.title,
      description: bet.description,
      terms: n.terms?.trim() || bet.terms,
      token: bet.token,
      settler: bet.settler,
      feeBps: bet.feeBps,
      endDate,
      outcomes,
      proposerOutcome: bet.proposerOutcome,
      acceptorOutcome: bet.acceptorOutcome,
      yourStakeStr: fullAmount(n.proposerStake, decimals),
      theirStakeStr: fullAmount(n.acceptorStake, decimals),
    };
    try {
      sessionStorage.setItem(RELAUNCH_KEY, JSON.stringify(payload));
    } catch {
      /* ignore storage errors */
    }
    router.push("/create?type=sidebet");
  }

  // Only relevant while the bet is open (or there's history to show).
  const showSendBox = !!me && !isProposer && bet.status === "Open";
  if (!me) return null;
  if (negotiations.length === 0 && !showSendBox) return null;

  return (
    <section id="negotiations" className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-[hsl(var(--primary))]" />
        <h3 className="text-sm font-semibold">
          {isProposer ? "Counter-offers" : "Negotiate terms"}
        </h3>
      </div>

      {showSendBox && (
        <div>
          {!open ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Like the premise but want different odds? Send the proposer your
                terms — they can accept and relaunch.
              </p>
              <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0">
                Propose new terms
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="label">Proposer stakes</span>
                  <input
                    className="input font-mono"
                    inputMode="decimal"
                    value={proposerStakeStr}
                    onChange={(e) => setProposerStakeStr(e.target.value)}
                  />
                </label>
                <label className="space-y-1.5 block">
                  <span className="label">You stake</span>
                  <input
                    className="input font-mono"
                    inputMode="decimal"
                    value={acceptorStakeStr}
                    onChange={(e) => setAcceptorStakeStr(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Stakes are in {tokenSym}. Adjust either side to revise the odds.
              </p>
              <label className="space-y-1.5 block">
                <span className="label">Revised terms (optional)</span>
                <textarea
                  className="textarea min-h-[80px]"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Leave blank to keep the original resolution terms."
                  maxLength={10_000}
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="label">Message (optional)</span>
                <input
                  className="input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a note for the proposer"
                  maxLength={1000}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={sendOffer.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => sendOffer.mutate()} disabled={sendOffer.isPending}>
                  {sendOffer.isPending ? "Sending…" : "Send offer"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {negotiations.length > 0 && (
        <ul className="space-y-3">
          {negotiations.map((n) => (
            <NegotiationCard
              key={n.id}
              n={n}
              decimals={decimals}
              tokenSym={tokenSym}
              isProposer={isProposer}
              betStatus={bet.status}
              onAccept={() => respond.mutate({ id: n.id, action: "accept" })}
              onDecline={() => respond.mutate({ id: n.id, action: "decline" })}
              onWithdraw={() => respond.mutate({ id: n.id, action: "withdraw" })}
              onRelaunch={() => relaunchWith(n)}
              busy={respond.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NegotiationCard({
  n,
  decimals,
  tokenSym,
  isProposer,
  betStatus,
  onAccept,
  onDecline,
  onWithdraw,
  onRelaunch,
  busy,
}: {
  n: Negotiation;
  decimals: number;
  tokenSym: string;
  isProposer: boolean;
  betStatus: string;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onRelaunch: () => void;
  busy: boolean;
}) {
  const proposerStake = useMemo(() => BigInt(n.proposerStake), [n.proposerStake]);
  const acceptorStake = useMemo(() => BigInt(n.acceptorStake), [n.acceptorStake]);

  const statusTone: Record<Negotiation["status"], string> = {
    Pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    Accepted: "bg-success/15 text-success",
    Declined: "bg-danger/15 text-danger",
    Withdrawn: "bg-muted text-muted-foreground",
  };

  return (
    <li className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Identity address={n.fromAddress} size={22} />
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[n.status]}`}>
          {n.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
        <div>
          <div className="label">Proposer stakes</div>
          <div className="mt-0.5 inline-flex items-center font-mono font-semibold">
            {formatToken(proposerStake, decimals)}
            <TokenSymbol symbol={tokenSym} size={11} className="ml-1 text-xs font-normal text-muted-foreground" />
          </div>
        </div>
        <div>
          <div className="label">Acceptor stakes</div>
          <div className="mt-0.5 inline-flex items-center font-mono font-semibold">
            {formatToken(acceptorStake, decimals)}
            <TokenSymbol symbol={tokenSym} size={11} className="ml-1 text-xs font-normal text-muted-foreground" />
          </div>
        </div>
      </div>

      {n.terms && (
        <div>
          <div className="label">Revised terms</div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{n.terms}</p>
        </div>
      )}
      {n.message && (
        <p className="text-sm text-muted-foreground">“{n.message}”</p>
      )}

      {isProposer && (
        <Link
          href={`/messages?with=${n.fromAddress}`}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Open DM thread →
        </Link>
      )}

      {/* Actions */}
      {n.status === "Pending" && betStatus === "Open" && (
        <div className="flex flex-wrap justify-end gap-2">
          {isProposer ? (
            <>
              <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy}>
                Decline
              </Button>
              <Button size="sm" onClick={onAccept} disabled={busy}>
                Accept terms
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onWithdraw} disabled={busy}>
              Withdraw
            </Button>
          )}
        </div>
      )}

      {n.status === "Accepted" && isProposer && betStatus === "Open" && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <p className="text-muted-foreground">
            You accepted these terms. Cancel this offer to pull your stake, then
            relaunch with the agreed terms pre-filled.
          </p>
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={onRelaunch}>
              Relaunch with these terms
            </Button>
          </div>
        </div>
      )}

      {n.status === "Accepted" && !isProposer && (
        <p className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-muted-foreground">
          Accepted! The proposer will relaunch the bet with these terms — watch
          for the new offer.
        </p>
      )}
    </li>
  );
}
