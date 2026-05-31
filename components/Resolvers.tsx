"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { BadgeCheck, Gavel, Plus, ShieldCheck, UserCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount } from "wagmi";

import { Identity } from "@/components/profile/Identity";
import { SettlerSelect } from "@/components/SettlerSelect";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { isAdminAddress } from "@/lib/admin";
import type { BetResolutionConsensus } from "@/lib/betResolution";
import { jsonFetch } from "@/lib/fetcher";
import { usePlatformSettings } from "@/lib/hooks/usePlatformSettings";
import { displayResolver, hasCustomSettler } from "@/lib/settlerUtils";
import { shortAddr } from "@/lib/utils";

type Settler = { address: string; username: string | null; feeBps: number };
type ResolverRequest = {
  id: number;
  requestedBy: string;
  suggested: string | null;
  reason: string | null;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string | null;
};

/**
 * Shows who resolves a bet/market. Custom resolvers require counterparty approval.
 */
export function Resolvers({
  subjectType,
  subjectId,
  settler,
  customSettler,
  participants = [],
  requestEligible = true,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  settler: string;
  customSettler?: string | null;
  /** Who can approve a resolver change (proposer/acceptor or creator/settler). */
  participants?: string[];
  /** When false, hide the request button (e.g. bet not matched yet). */
  requestEligible?: boolean;
}) {
  const { address } = useAccount();

  const { data: settlerData } = useQuery<{ settlers: Settler[] }>({
    queryKey: ["approvedSettlers"],
    queryFn: () => jsonFetch("/api/settlers"),
    staleTime: 5 * 60_000,
  });
  const approved = settlerData?.settlers ?? [];
  const isApproved = (addr: string) =>
    approved.some((s) => s.address.toLowerCase() === addr.toLowerCase());
  const customResolver = hasCustomSettler({ customSettler });
  const resolverAddress = displayResolver({ settler, customSettler });

  const { data: resolutionData } = useQuery<{ consensus: BetResolutionConsensus }>({
    queryKey: ["resolution", "bet", subjectId],
    queryFn: () =>
      jsonFetch(
        `/api/resolutions?subjectType=bet&subjectId=${subjectId}`,
      ),
    enabled: subjectType === "bet" && !customResolver,
    refetchInterval: 8_000,
  });
  const showAutomaticBadge =
    subjectType === "bet" &&
    isAdminAddress(settler) &&
    !customResolver &&
    resolutionData?.consensus === "unanimous";

  const reqKey = ["resolverRequests", subjectType, subjectId];
  const { data: reqData } = useQuery<{ requests: ResolverRequest[] }>({
    queryKey: reqKey,
    queryFn: () =>
      jsonFetch(
        `/api/resolver-requests?subjectType=${subjectType}&subjectId=${subjectId}`,
      ),
    refetchInterval: 15_000,
  });
  const requests = reqData?.requests ?? [];
  const pendingRequest = requests.find((r) => r.status === "Pending");
  const pendingCounterparty =
    pendingRequest && participants.length > 0
      ? participants.find(
          (p) => p.toLowerCase() !== pendingRequest.requestedBy.toLowerCase(),
        )
      : null;
  const myPending =
    !!address &&
    pendingRequest?.requestedBy.toLowerCase() === address.toLowerCase();
  const canRespondToPending =
    !!address &&
    !!pendingCounterparty &&
    pendingCounterparty.toLowerCase() === address.toLowerCase();

  const [open, setOpen] = useState(false);

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Resolver</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        {customResolver
          ? subjectType === "bet"
            ? "Both sides approved this wallet to declare the winning outcome. When you both agree on the result, payout auto-settles on-chain."
            : "Both sides approved this wallet to declare the winning outcome and settle the market after verification."
          : `The resolver declares the winning outcome. Picked when the ${
              subjectType === "bet" ? "sidebet" : "market"
            } was created.`}
      </p>

      <ResolverRow
        address={resolverAddress}
        verified={isApproved(resolverAddress)}
        custom={customResolver}
        primary
        automatic={showAutomaticBadge}
      />

      {!customResolver && pendingRequest && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-warning">
                {myPending
                  ? "Waiting for counterparty approval"
                  : "Resolver change proposed"}
              </p>
              <p className="text-muted-foreground">
                {myPending
                  ? "Your counterparty must approve before this wallet can resolve."
                  : "Your counterparty wants to add a resolver:"}{" "}
                <span className="font-mono font-medium text-foreground">
                  {pendingRequest.suggested
                    ? shortAddr(pendingRequest.suggested)
                    : "—"}
                </span>
              </p>
              {pendingRequest.reason && (
                <p className="text-muted-foreground italic">
                  “{pendingRequest.reason}”
                </p>
              )}
            </div>
          </div>
          {canRespondToPending && pendingRequest.suggested && (
            <CounterpartyRespond
              requestId={pendingRequest.id}
              subjectType={subjectType}
              subjectId={subjectId}
              suggested={pendingRequest.suggested}
            />
          )}
        </div>
      )}

      {!customResolver && !pendingRequest && (
        <div className="border-t border-border pt-3">
          {requestEligible ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setOpen(true)}
              disabled={!address}
            >
              <Plus className="h-4 w-4" />
              {address
                ? "Request a different resolver"
                : "Sign in to request a resolver"}
            </Button>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">
              {subjectType === "bet"
                ? "Both sides must be matched before requesting a new resolver."
                : "Resolver changes are available while the market is open."}
            </p>
          )}
        </div>
      )}

      {open && (
        <RequestResolverModal
          subjectType={subjectType}
          subjectId={subjectId}
          currentResolver={resolverAddress}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function CounterpartyRespond({
  requestId,
  subjectType,
  subjectId,
  suggested,
}: {
  requestId: number;
  subjectType: "bet" | "market";
  subjectId: number;
  suggested: string;
}) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const respond = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      if (!address) throw new Error("Connect a wallet first");
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch(`/api/resolver-requests/${requestId}/respond`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, action }),
      });
    },
    onSuccess: (_data, action) => {
      push({
        title: action === "approve" ? "Resolver approved" : "Request declined",
        description:
          action === "approve"
            ? `${shortAddr(suggested)} can now declare the outcome.`
            : "The resolver change was not applied.",
        variant: "success",
      });
      void qc.invalidateQueries({
        queryKey: ["resolverRequests", subjectType, subjectId],
      });
      void qc.invalidateQueries({ queryKey: ["bet", subjectId] });
      void qc.invalidateQueries({ queryKey: ["market", subjectId] });
    },
    onError: (e) =>
      push({
        title: "Couldn't respond",
        description: (e as Error).message,
        variant: "danger",
      }),
  });

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="flex-1"
        disabled={respond.isPending}
        onClick={() => respond.mutate("approve")}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={respond.isPending}
        onClick={() => respond.mutate("reject")}
      >
        Decline
      </Button>
    </div>
  );
}

function ResolverRow({
  address,
  verified,
  primary,
  automatic,
  custom,
}: {
  address: string;
  verified?: boolean;
  primary?: boolean;
  automatic?: boolean;
  custom?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <Identity address={address} size={28} weight="semibold" />
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {automatic && (
          <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Automatic
          </span>
        )}
        {custom ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
            <UserCog className="h-3 w-3" />
            Custom resolver
          </span>
        ) : primary && verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
            <BadgeCheck className="h-3 w-3" />
            Verified
          </span>
        ) : primary ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Settler
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RequestResolverModal({
  subjectType,
  subjectId,
  currentResolver,
  onClose,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  currentResolver: string;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();
  const platformQ = usePlatformSettings();
  const platformFeeBps = platformQ.data?.sidebetFeeBps ?? 0;

  const [selected, setSelected] = useState(currentResolver);
  const [isCustom, setIsCustom] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const suggested = getAddress(selected);
      if (suggested.toLowerCase() === currentResolver.toLowerCase()) {
        throw new Error("Pick a different resolver wallet");
      }
      return jsonFetch("/api/resolver-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requestedBy: address,
          subjectType,
          subjectId,
          suggested,
          reason: reason.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      push({
        title: "Request sent",
        description: "Your counterparty must approve before it takes effect.",
        variant: "success",
      });
      void qc.invalidateQueries({
        queryKey: ["resolverRequests", subjectType, subjectId],
      });
      onClose();
    },
    onError: (e) =>
      push({
        title: "Couldn't send request",
        description: (e as Error).message,
        variant: "danger",
      }),
  });

  const canSubmit =
    !!selected &&
    getAddress(selected).toLowerCase() !== currentResolver.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Request a different resolver</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Pick a whitelisted settler or paste a custom wallet. Your counterparty
          must approve before they can declare the outcome
          {subjectType === "bet"
            ? " and trigger automatic on-chain settlement when you both agree."
            : " and settle the market."}
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <span className="label">New resolver</span>
            <SettlerSelect
              value={selected}
              onChange={(addr, _feeBps, custom) => {
                setSelected(addr);
                setIsCustom(!!custom);
              }}
              platformFeeBps={platformFeeBps}
              excludeAddress={address}
            />
            {isCustom && (
              <p className="text-[11px] text-muted-foreground">
                Custom wallets are not on the whitelist — both sides must trust
                them to call the outcome fairly.
              </p>
            )}
          </div>

          <label className="space-y-1.5 block">
            <span className="label">Reason (optional)</span>
            <textarea
              className="textarea min-h-[90px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. the current settler is unresponsive or has a conflict of interest."
              maxLength={1000}
            />
          </label>
        </div>

        <Button
          className="mt-5 w-full"
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !canSubmit}
        >
          {submit.isPending ? "Sending…" : "Send for approval"}
        </Button>
      </div>
    </div>
  );
}
