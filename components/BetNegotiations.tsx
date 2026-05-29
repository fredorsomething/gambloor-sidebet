"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Handshake } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";

import { NegotiationCard } from "@/components/negotiations/NegotiationCard";
import { NegotiationCompose } from "@/components/negotiations/NegotiationCompose";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { relaunchPayloadFromNegotiation, type NegotiationPayload } from "@/lib/negotiations";
import type { BetRow } from "@/lib/types";

export const RELAUNCH_KEY = "sidebet:relaunch";

type ListResponse = {
  isProposer: boolean;
  proposer: string;
  status: string;
  negotiations: NegotiationPayload[];
};

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

  const [open, setOpen] = useState(false);
  const [counterTo, setCounterTo] = useState<string | null>(null);

  const sendOffer = useMutation({
    mutationFn: async (payload: {
      proposerStake: string;
      acceptorStake: string;
      terms: string;
      message: string;
      to?: string;
    }) => {
      if (!address) throw new Error("Connect a wallet first");
      const headers = await authHeader();
      return jsonFetch(`/api/bets/${bet.id}/negotiations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: address,
          to: payload.to,
          proposerStake: payload.proposerStake,
          acceptorStake: payload.acceptorStake,
          terms: payload.terms || undefined,
          message: payload.message || undefined,
        }),
      });
    },
    onSuccess: () => {
      push({
        title: "Offer sent",
        description: "Check Messages to continue the negotiation.",
        variant: "success",
      });
      setOpen(false);
      setCounterTo(null);
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      push({
        title: "Couldn't send offer",
        description: (e as Error).message,
        variant: "danger",
      }),
  });

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
        vars.action === "accept"
          ? "accepted"
          : vars.action === "decline"
            ? "declined"
            : "withdrawn";
      push({ title: `Offer ${label}`, variant: "success" });
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      push({
        title: "Action failed",
        description: (e as Error).message,
        variant: "danger",
      }),
  });

  function relaunchWith(n: NegotiationPayload) {
    const payload = relaunchPayloadFromNegotiation(
      {
        id: bet.id,
        title: bet.title,
        status: bet.status,
        proposer: bet.proposer,
        tokenSymbol: bet.tokenSymbol,
        decimals: bet.decimals,
        outcomes: bet.outcomes,
        proposerOutcome: bet.proposerOutcome,
        acceptorOutcome: bet.acceptorOutcome,
        terms: bet.terms,
        description: bet.description,
        token: bet.token,
        settler: bet.settler,
        feeBps: bet.feeBps,
        estimatedEndDate: bet.estimatedEndDate,
      },
      n,
      decimals,
    );
    try {
      sessionStorage.setItem(RELAUNCH_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    router.push("/create?type=sidebet");
  }

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
                terms — they can accept, counter, or decline in Messages.
              </p>
              <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0">
                Propose new terms
              </Button>
            </div>
          ) : (
            <NegotiationCompose
              tokenSym={tokenSym}
              decimals={decimals}
              defaultProposerStake={bet.proposerStake || bet.amount || "0"}
              defaultAcceptorStake={bet.acceptorStake || bet.amount || "0"}
              pending={sendOffer.isPending}
              onCancel={() => setOpen(false)}
              onSubmit={(p) => sendOffer.mutate(p)}
            />
          )}
        </div>
      )}

      {negotiations.length > 0 && (
        <ul className="space-y-3">
          {negotiations.map((n) => (
            <li key={n.id}>
              <NegotiationCard
                n={n}
                betTitle={bet.title}
                betId={bet.id}
                decimals={decimals}
                tokenSym={tokenSym}
                viewerAddress={address}
                betProposer={bet.proposer}
                betStatus={bet.status}
                onAccept={() => respond.mutate({ id: n.id, action: "accept" })}
                onDecline={() => respond.mutate({ id: n.id, action: "decline" })}
                onWithdraw={() => respond.mutate({ id: n.id, action: "withdraw" })}
                onRelaunch={() => relaunchWith(n)}
                onCounter={
                  isProposer && n.status === "Pending"
                    ? () => setCounterTo(n.fromAddress)
                    : undefined
                }
                busy={respond.isPending || sendOffer.isPending}
              />
              {counterTo === n.fromAddress && (
                <div className="mt-3">
                  <NegotiationCompose
                    tokenSym={tokenSym}
                    decimals={decimals}
                    defaultProposerStake={n.proposerStake}
                    defaultAcceptorStake={n.acceptorStake}
                    submitLabel="Send counter-offer"
                    pending={sendOffer.isPending}
                    onCancel={() => setCounterTo(null)}
                    onSubmit={(p) =>
                      sendOffer.mutate({ ...p, to: n.fromAddress })
                    }
                  />
                </div>
              )}
              {isProposer && (
                <Link
                  href={`/messages?with=${n.fromAddress}&bet=${bet.id}`}
                  className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Open DM thread →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
