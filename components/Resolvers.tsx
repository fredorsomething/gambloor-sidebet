"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { BadgeCheck, Gavel, Plus, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Identity } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Settler = { address: string; username: string | null; feeBps: number };
type ResolverRequest = {
  id: number;
  requestedBy: string;
  suggested: string | null;
  reason: string | null;
  status: "Pending" | "Approved" | "Rejected";
};

/**
 * Clearly shows who can resolve a bet/market (the on-chain settler, plus any
 * additional resolvers approved by request) and lets signed-in users ask admins
 * to add another resolver.
 */
export function Resolvers({
  subjectType,
  subjectId,
  settler,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  settler: string;
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

  const reqKey = ["resolverRequests", subjectType, subjectId];
  const { data: reqData } = useQuery<{ requests: ResolverRequest[] }>({
    queryKey: reqKey,
    queryFn: () =>
      jsonFetch(
        `/api/resolver-requests?subjectType=${subjectType}&subjectId=${subjectId}`,
      ),
    refetchInterval: 30_000,
  });
  const requests = reqData?.requests ?? [];
  const addedResolvers = requests.filter(
    (r) => r.status === "Approved" && r.suggested,
  );
  const myPending =
    !!address &&
    requests.find(
      (r) =>
        r.status === "Pending" &&
        r.requestedBy.toLowerCase() === address.toLowerCase(),
    );
  const pendingCount = requests.filter((r) => r.status === "Pending").length;

  const [open, setOpen] = useState(false);

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">
          {addedResolvers.length > 0 ? "Resolvers" : "Resolver"}
        </h3>
      </div>

      <p className="text-xs text-muted-foreground">
        The resolver declares the winning outcome. Picked when the{" "}
        {subjectType === "bet" ? "bet" : "market"} was created.
      </p>

      <ResolverRow
        address={settler}
        verified={isApproved(settler)}
        primary
      />

      {addedResolvers.map((r) => (
        <ResolverRow key={r.id} address={r.suggested!} added />
      ))}

      <div className="border-t border-border pt-3">
        {myPending ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Your request for an additional resolver is under review.
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => setOpen(true)}
            disabled={!address}
          >
            <Plus className="h-4 w-4" />
            {address ? "Request an additional resolver" : "Sign in to request a resolver"}
          </Button>
        )}
        {pendingCount > 0 && !myPending && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {pendingCount} request{pendingCount > 1 ? "s" : ""} pending admin review.
          </p>
        )}
      </div>

      {open && (
        <RequestResolverModal
          subjectType={subjectType}
          subjectId={subjectId}
          settlers={approved}
          currentSettler={settler}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function ResolverRow({
  address,
  verified,
  primary,
  added,
}: {
  address: string;
  verified?: boolean;
  primary?: boolean;
  added?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <Identity address={address} size={28} weight="semibold" />
      <div className="flex shrink-0 items-center gap-2">
        {added ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            <Plus className="h-3 w-3" />
            Added
          </span>
        ) : verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
            <BadgeCheck className="h-3 w-3" />
            Verified
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Settler
          </span>
        )}
      </div>
    </div>
  );
}

function RequestResolverModal({
  subjectType,
  subjectId,
  settlers,
  currentSettler,
  onClose,
}: {
  subjectType: "bet" | "market";
  subjectId: number;
  settlers: Settler[];
  currentSettler: string;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const [suggested, setSuggested] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = settlers.filter(
    (s) => s.address.toLowerCase() !== currentSettler.toLowerCase(),
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return jsonFetch("/api/resolver-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requestedBy: address,
          subjectType,
          subjectId,
          suggested: suggested || undefined,
          reason: reason.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      push({
        title: "Request sent",
        description: "Admins will review adding another resolver.",
        variant: "success",
      });
      void qc.invalidateQueries({
        queryKey: ["resolverRequests", subjectType, subjectId],
      });
      onClose();
    },
    onError: (e) =>
      push({ title: "Couldn't send request", description: (e as Error).message, variant: "danger" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Request an additional resolver</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Want a second neutral party able to help resolve this? Suggest an
          approved settler (optional) and tell admins why.
        </p>

        <div className="mt-4 space-y-4">
          <label className="space-y-1.5 block">
            <span className="label">Suggested resolver (optional)</span>
            <select
              className="select"
              value={suggested}
              onChange={(e) => setSuggested(e.target.value)}
            >
              <option value="">No preference — let admins decide</option>
              {options.map((s) => (
                <option key={s.address} value={s.address}>
                  {s.username ? `@${s.username}` : s.address}
                </option>
              ))}
            </select>
          </label>

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
          disabled={submit.isPending}
        >
          {submit.isPending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </div>
  );
}
