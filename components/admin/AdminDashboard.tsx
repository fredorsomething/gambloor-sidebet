"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Gavel,
  MessageCircleOff,
  Scale,
  ShieldCheck,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { isAddress } from "viem";

import { ASSIGNABLE_BADGES, type BadgeKind } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import type { ListMarketsResponse, MarketRow } from "@/lib/types";
import { cn, shortAddr } from "@/lib/utils";

type Tab =
  | "overview"
  | "markets"
  | "bets"
  | "users"
  | "settlers"
  | "chat"
  | "resolutions"
  | "resolvers";

type AdminBetProposal = {
  id: number;
  status: "Pending" | "Approved" | "Rejected";
  proposedBy: string;
  proposedOutcome: number;
  proposedLabel: string;
  note: string | null;
};

type AdminBetRow = {
  id: number;
  title: string;
  description: string;
  status: string;
  proposer: string;
  acceptor: string | null;
  settler: string;
  outcomes: string[];
  winningOutcome: number | null;
  winner: string | null;
  winningLabel: string | null;
  proposal: AdminBetProposal | null;
};

type ResolutionItem = {
  id: number;
  subjectType: "bet" | "market";
  subjectId: number;
  proposedBy: string;
  proposedOutcome: number;
  note: string | null;
  createdAt: string;
  subjectTitle: string;
  subjectLink: string | null;
  outcomeLabel: string;
};

type AdminUser = {
  address: string;
  username: string | null;
  verified: boolean;
  badges: string[];
};

type SettlerRow = {
  address: string;
  username: string | null;
  feeBps: number;
  approved: boolean;
};

type ChatMuteRow = {
  address: string;
  username: string | null;
  mutedUntil: string | null;
  permanent: boolean;
  reason: string | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "markets", label: "Markets" },
  { id: "bets", label: "Sidebets" },
  { id: "users", label: "Users" },
  { id: "settlers", label: "Settlers" },
  { id: "chat", label: "Chat" },
  { id: "resolutions", label: "Resolutions" },
  { id: "resolvers", label: "Resolver requests" },
];

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function AdminDashboard({ address }: { address: string }) {
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  async function adminFetch<T>(path: string): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error("Session expired");
    const sep = path.includes("?") ? "&" : "?";
    return jsonFetch<T>(`${path}${sep}address=${address}`, {
      headers: authHeaders(token),
    });
  }

  const marketsQ = useQuery<ListMarketsResponse>({
    queryKey: ["admin", "pendingMarkets"],
    queryFn: () => jsonFetch(`/api/markets?status=Pending&take=100`),
    refetchInterval: 20_000,
  });

  const allMarketsQ = useQuery<{ markets: MarketRow[] }>({
    queryKey: ["admin", "markets", address],
    enabled: tab === "markets",
    queryFn: () => adminFetch<{ markets: MarketRow[] }>("/api/admin/markets"),
  });

  const betsQ = useQuery<{ bets: AdminBetRow[] }>({
    queryKey: ["admin", "bets", address],
    enabled: tab === "bets",
    queryFn: () => adminFetch<{ bets: AdminBetRow[] }>("/api/admin/bets"),
  });

  const resolutionsQ = useQuery<{ proposals: ResolutionItem[] }>({
    queryKey: ["admin", "pendingResolutions"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { proposals: [] };
      return jsonFetch(`/api/resolutions?address=${address}&status=Pending`, {
        headers: authHeaders(token),
      });
    },
  });

  const resolverReqQ = useQuery<{ requests: Array<{
    id: number;
    subjectType: string;
    subjectId: number;
    subjectTitle: string;
    subjectLink: string;
    requestedBy: string;
    suggested: string | null;
    reason: string | null;
  }> }>({
    queryKey: ["admin", "resolver-requests", address],
    enabled: tab === "resolvers",
    queryFn: () =>
      adminFetch("/api/admin/resolver-requests?status=Pending"),
  });

  const settlersQ = useQuery<{ settlers: SettlerRow[] }>({
    queryKey: ["admin", "settlers", address],
    enabled: tab === "settlers" || tab === "overview" || tab === "users",
    queryFn: () => adminFetch<{ settlers: SettlerRow[] }>("/api/admin/settlers"),
  });

  const mutesQ = useQuery<{ mutes: ChatMuteRow[] }>({
    queryKey: ["admin", "mutes", address],
    enabled: tab === "chat",
    queryFn: () => adminFetch<{ mutes: ChatMuteRow[] }>("/api/admin/chat/mutes"),
  });

  async function adminPost<T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error("Session expired");
    return jsonFetch<T>(path, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ admin: address, ...body }),
    });
  }

  async function adminPatch(path: string, body: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session expired");
    return jsonFetch(path, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ admin: address, ...body }),
    });
  }

  async function adminDelete(path: string, body: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session expired");
    return jsonFetch(path, {
      method: "DELETE",
      headers: authHeaders(token),
      body: JSON.stringify({ admin: address, ...body }),
    });
  }

  const reviewMarket = useMutation({
    mutationFn: (v: { id: number; action: "approve" | "reject" }) =>
      adminPost(`/api/markets/${v.id}/approve`, { address, action: v.action }),
    onSuccess: (_d, v) => {
      push({
        title: v.action === "approve" ? "Market approved" : "Market rejected",
        variant: "success",
      });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) =>
      push({ title: (e as Error).message, variant: "danger" }),
  });

  const reviewResolution = useMutation({
    mutationFn: (v: { id: number; action: "approve" | "reject" }) =>
      adminPost<{ settled?: boolean; message?: string }>(
        `/api/resolutions/${v.id}`,
        { address, action: v.action },
      ),
    onSuccess: (d) => {
      push({
        title: d?.settled ? "Already settled on-chain" : "Resolution updated",
        description: d?.message,
        variant: d?.settled ? "default" : "success",
      });
      void qc.invalidateQueries({ queryKey: ["admin", "pendingResolutions"] });
      void qc.invalidateQueries({ queryKey: ["admin", "bets", address] });
    },
    onError: (e) =>
      push({ title: (e as Error).message, variant: "danger" }),
  });

  const clearChat = useMutation({
    mutationFn: () =>
      adminPost<{ deleted: number }>("/api/admin/chat/clear", {}),
    onSuccess: (d) => {
      push({ title: `Cleared ${d.deleted} messages`, variant: "success" });
      void qc.invalidateQueries({ queryKey: ["global-chat"] });
    },
    onError: (e) =>
      push({ title: (e as Error).message, variant: "danger" }),
  });

  const pendingMarkets = marketsQ.data?.items ?? [];
  const resolutions = resolutionsQ.data?.proposals ?? [];
  const settlers = settlersQ.data?.settlers ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-danger" />
          Admin dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage markets, users, settlers, chat, and resolutions.
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "markets" && pendingMarkets.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                {pendingMarkets.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pending markets" value={pendingMarkets.length} />
          <StatCard label="Resolutions to verify" value={resolutions.length} />
          <StatCard
            label="Approved settlers"
            value={settlers.filter((s) => s.approved).length}
          />
          <StatCard
            label="Resolver requests"
            value={resolverReqQ.data?.requests?.length ?? "—"}
          />
        </div>
      )}

      {tab === "markets" && (
        <MarketsPanel
          pending={pendingMarkets}
          all={allMarketsQ.data?.markets ?? []}
          loading={allMarketsQ.isLoading}
          onApprove={(id) => reviewMarket.mutate({ id, action: "approve" })}
          onReject={(id) => reviewMarket.mutate({ id, action: "reject" })}
          onSave={async (id, data) => {
            await adminPatch(`/api/admin/markets/${id}`, data);
            push({ title: "Market saved", variant: "success" });
            void qc.invalidateQueries({ queryKey: ["admin"] });
          }}
          onRemove={async (id) => {
            if (!confirm("Remove this market from public listings?")) return;
            await adminDelete(`/api/admin/markets/${id}`, {});
            push({ title: "Market removed", variant: "success" });
            void qc.invalidateQueries({ queryKey: ["admin"] });
          }}
          reviewBusy={reviewMarket.isPending}
        />
      )}

      {tab === "bets" && (
        <BetsPanel
          bets={betsQ.data?.bets ?? []}
          loading={betsQ.isLoading}
          onReview={(id, action) => reviewResolution.mutate({ id, action })}
          reviewing={reviewResolution.isPending}
          onSave={async (id, data) => {
            await adminPatch(`/api/admin/bets/${id}`, data);
            push({ title: "Sidebet saved", variant: "success" });
            void qc.invalidateQueries({ queryKey: ["admin", "bets", address] });
          }}
        />
      )}

      {tab === "users" && (
        <UsersPanel
          address={address}
          settlers={settlers}
          onToggleSettler={async (addr, makeSettler, feeBps) => {
            if (makeSettler) {
              await adminPost("/api/admin/settlers", {
                address: addr,
                feeBps,
                approved: true,
              });
              push({ title: "User whitelisted as settler", variant: "success" });
            } else {
              await adminDelete("/api/admin/settlers", { address: addr });
              push({ title: "Settler access revoked", variant: "success" });
            }
            void qc.invalidateQueries({ queryKey: ["admin", "settlers", address] });
          }}
          onSearch={async (q) => {
            const token = await getAccessToken();
            if (!token) return [];
            const res = await jsonFetch<{ users: AdminUser[] }>(
              `/api/admin/users?address=${address}&q=${encodeURIComponent(q)}`,
              { headers: authHeaders(token) },
            );
            return res.users;
          }}
          onSave={async (target, patch) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Session expired");
            await jsonFetch("/api/admin/users", {
              method: "PATCH",
              headers: authHeaders(token),
              body: JSON.stringify({ admin: address, address: target, ...patch }),
            });
            push({ title: "User updated", variant: "success" });
          }}
        />
      )}

      {tab === "settlers" && (
        <SettlersPanel
          settlers={settlers}
          onAdd={async (addr, feeBps) => {
            await adminPost("/api/admin/settlers", {
              address: addr,
              feeBps,
              approved: true,
            });
            push({ title: "Settler added", variant: "success" });
            void qc.invalidateQueries({ queryKey: ["admin", "/api/admin/settlers"] });
          }}
          onRevoke={async (addr) => {
            await adminDelete("/api/admin/settlers", { address: addr });
            push({ title: "Settler revoked", variant: "success" });
            void qc.invalidateQueries({ queryKey: ["admin", "/api/admin/settlers"] });
          }}
        />
      )}

      {tab === "chat" && (
        <ChatPanel
          mutes={mutesQ.data?.mutes ?? []}
          onClear={() => {
            if (!confirm("Delete ALL global chat messages?")) return;
            clearChat.mutate();
          }}
          clearing={clearChat.isPending}
          onMute={async (target, hours, permanent) => {
            await adminPost("/api/admin/chat/mutes", {
              target,
              hours: permanent ? undefined : hours,
              permanent,
            });
            push({ title: "User muted", variant: "success" });
            void mutesQ.refetch();
          }}
          onUnmute={async (target) => {
            await adminDelete("/api/admin/chat/mutes", { target });
            push({ title: "Unmuted", variant: "success" });
            void mutesQ.refetch();
          }}
        />
      )}

      {tab === "resolutions" && (
        <ResolutionsPanel
          items={resolutions}
          onReview={(id, action) => reviewResolution.mutate({ id, action })}
          pending={reviewResolution.isPending}
        />
      )}

      {tab === "resolvers" && (
        <ResolverRequestsPanel
          requests={resolverReqQ.data?.requests ?? []}
          onReview={async (id, action) => {
            await adminPost("/api/admin/resolver-requests", { id, action });
            push({ title: `Request ${action}d`, variant: "success" });
            void resolverReqQ.refetch();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function MarketsPanel({
  pending,
  all,
  loading,
  onApprove,
  onReject,
  onSave,
  onRemove,
  reviewBusy,
}: {
  pending: MarketRow[];
  all: MarketRow[];
  loading: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onSave: (id: number, data: Record<string, unknown>) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  reviewBusy: boolean;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Open");

  function startEdit(m: MarketRow) {
    setEditId(m.id);
    setTitle(m.title);
    setDescription(m.description);
    setStatus(m.status);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Store className="h-4 w-4 text-primary" />
          Pending approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="card p-4 text-sm text-muted-foreground">None waiting.</p>
        ) : (
          pending.map((m) => (
            <div key={m.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <MarketSummary m={m} />
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => onApprove(m.id)} disabled={reviewBusy} className="gap-1">
                  <Check className="h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => onReject(m.id)} disabled={reviewBusy} className="gap-1">
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">All markets</h2>
        {loading ? (
          <div className="card h-24 animate-pulse bg-muted/40" />
        ) : (
          all.map((m) => (
            <div key={m.id} className="card space-y-3 p-4">
              <MarketSummary m={m} />
              <p className="text-xs text-muted-foreground">
                Status: <span className="font-semibold">{m.status}</span>
              </p>
              {editId === m.id ? (
                <div className="space-y-2">
                  <input className="input w-full text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <textarea className="input w-full text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                  <select className="input w-full text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {["Pending", "Open", "Resolved", "Rejected", "Removed"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void onSave(m.id, { title, description, status }).then(() => setEditId(null))}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(m)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => void onRemove(m.id)} className="gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function MarketSummary({ m }: { m: MarketRow }) {
  return (
    <div className="min-w-0 flex-1">
      <Link href={`/markets/${m.id}`} className="block truncate font-medium hover:text-primary">
        {m.title}
      </Link>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">by {shortAddr(m.creator)}</p>
    </div>
  );
}

const BET_STATUS_STYLE: Record<string, string> = {
  Open: "bg-muted text-muted-foreground",
  Matched: "bg-primary/15 text-primary",
  Settled: "bg-success/15 text-success",
  Cancelled: "bg-muted text-muted-foreground",
  Refunded: "bg-warning/15 text-warning",
};

function BetsPanel({
  bets,
  loading,
  onReview,
  reviewing,
  onSave,
}: {
  bets: AdminBetRow[];
  loading: boolean;
  onReview: (proposalId: number, action: "approve" | "reject") => void;
  reviewing: boolean;
  onSave: (id: number, data: Record<string, unknown>) => Promise<void>;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const pendingCount = bets.filter(
    (b) => b.proposal?.status === "Pending",
  ).length;

  if (loading) {
    return <div className="card h-24 animate-pulse bg-muted/40" />;
  }
  if (bets.length === 0) {
    return <p className="card p-6 text-sm text-muted-foreground">No sidebets.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {bets.length} sidebet{bets.length === 1 ? "" : "s"}
        {pendingCount > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-warning">
              {pendingCount} awaiting verification
            </span>
          </>
        )}
        . Settlement is on-chain by each bet&apos;s settler; verifying a proposal
        here reviews the proposed outcome (and reconciles bets already settled).
      </p>

      {bets.map((b) => (
        <div key={b.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                BET_STATUS_STYLE[b.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {b.status}
            </span>
            <Link
              href={`/bets/${b.id}`}
              className="min-w-0 flex-1 truncate font-medium hover:text-primary"
            >
              {b.title}
            </Link>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <p>Settler: <span className="font-mono">{shortAddr(b.settler)}</span></p>
            <p>Proposer: <span className="font-mono">{shortAddr(b.proposer)}</span></p>
            {b.acceptor && (
              <p>Acceptor: <span className="font-mono">{shortAddr(b.acceptor)}</span></p>
            )}
            <p>Outcomes: <span className="text-foreground">{b.outcomes.join(" / ")}</span></p>
          </div>

          {b.status === "Settled" && (
            <p className="rounded-lg bg-success/10 p-2 text-sm">
              Settled on-chain ·{" "}
              <span className="font-semibold text-success">
                {b.winningLabel ?? "stakes refunded"}
              </span>
              {b.winner && (
                <span className="text-muted-foreground">
                  {" "}— winner {shortAddr(b.winner)}
                </span>
              )}
            </p>
          )}

          {b.proposal && (
            <div
              className={cn(
                "rounded-lg border p-3 text-sm",
                b.proposal.status === "Pending"
                  ? "border-warning/40 bg-warning/10"
                  : b.proposal.status === "Approved"
                    ? "border-success/40 bg-success/10"
                    : "border-border bg-muted/30",
              )}
            >
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">
                  Proposed outcome: {b.proposal.proposedLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({b.proposal.status}) by {shortAddr(b.proposal.proposedBy)}
                </span>
              </p>
              {b.proposal.note && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.proposal.note}
                </p>
              )}
              {b.proposal.status === "Pending" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={reviewing}
                    className="gap-1"
                    onClick={() => onReview(b.proposal!.id, "approve")}
                  >
                    <Gavel className="h-4 w-4" /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={reviewing}
                    className="gap-1"
                    onClick={() => onReview(b.proposal!.id, "reject")}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {editId === b.id ? (
            <div className="space-y-2">
              <input
                className="input w-full text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="input w-full text-sm"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void onSave(b.id, { title, description }).then(() =>
                      setEditId(null),
                    )
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditId(b.id);
                setTitle(b.title);
                setDescription(b.description);
              }}
            >
              Edit details
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function UsersPanel({
  address: _admin,
  settlers,
  onSearch,
  onSave,
  onToggleSettler,
}: {
  address: string;
  settlers: SettlerRow[];
  onSearch: (q: string) => Promise<AdminUser[]>;
  onSave: (target: string, patch: { verified?: boolean; badges?: string[] }) => Promise<void>;
  onToggleSettler: (
    target: string,
    makeSettler: boolean,
    feeBps: number,
  ) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [verified, setVerified] = useState(false);
  const [badges, setBadges] = useState<Set<string>>(new Set(["User"]));
  const [settlerFee, setSettlerFee] = useState("200");
  const [settlerBusy, setSettlerBusy] = useState(false);

  const activeSettler = selected
    ? settlers.find(
        (s) =>
          s.approved &&
          s.address.toLowerCase() === selected.address.toLowerCase(),
      )
    : undefined;

  async function search() {
    const users = await onSearch(q.trim());
    setResults(users);
    if (users[0]) pick(users[0]);
  }

  function pick(u: AdminUser) {
    setSelected(u);
    setVerified(u.verified);
    setBadges(new Set(u.badges.filter((b) => b !== "Admin")));
  }

  function toggleBadge(b: BadgeKind) {
    setBadges((prev) => {
      const next = new Set(prev);
      if (b === "User") return next;
      if (next.has(b)) next.delete(b);
      else next.add(b);
      if (!next.has("User")) next.add("User");
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Search username or address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <Button onClick={() => void search()}>Search</Button>
      </div>

      {results.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {results.map((u) => (
            <button
              key={u.address}
              type="button"
              onClick={() => pick(u)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                selected?.address === u.address
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted",
              )}
            >
              {u.username ? `@${u.username}` : shortAddr(u.address)}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="card space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{selected.username ? `@${selected.username}` : shortAddr(selected.address)}</p>
              <p className="font-mono text-xs text-muted-foreground">{selected.address}</p>
            </div>
            <Link href={`/u/${selected.username ?? selected.address}`} className="text-xs text-primary hover:underline">
              View profile →
            </Link>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            Verified (blue check)
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Badges</p>
            <div className="flex flex-wrap gap-2">
              {ASSIGNABLE_BADGES.map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={b === "User"}
                  onClick={() => toggleBadge(b)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    badges.has(b)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                    b === "User" && "opacity-60",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() =>
              void onSave(selected.address, {
                verified,
                badges: [...badges],
              })
            }
          >
            Save user
          </Button>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Scale className="h-4 w-4 text-primary" /> Settler whitelist
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeSettler
                    ? `Selectable as a settler by other users · ${activeSettler.feeBps} bps`
                    : "Not currently selectable as a settler."}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  activeSettler ? "text-success" : "text-muted-foreground",
                )}
              >
                {activeSettler ? "Whitelisted" : "Not a settler"}
              </span>
            </div>
            {activeSettler ? (
              <Button
                size="sm"
                variant="danger"
                disabled={settlerBusy}
                onClick={() => {
                  setSettlerBusy(true);
                  void onToggleSettler(selected.address, false, 0).finally(() =>
                    setSettlerBusy(false),
                  );
                }}
              >
                Revoke settler access
              </Button>
            ) : (
              <div className="flex items-end gap-2">
                <div className="w-28 space-y-1">
                  <label className="label">Fee (bps)</label>
                  <input
                    className="input w-full"
                    value={settlerFee}
                    onChange={(e) => setSettlerFee(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={settlerBusy}
                  className="gap-1"
                  onClick={() => {
                    setSettlerBusy(true);
                    void onToggleSettler(
                      selected.address,
                      true,
                      Number(settlerFee) || 200,
                    ).finally(() => setSettlerBusy(false));
                  }}
                >
                  <Scale className="h-4 w-4" /> Whitelist as settler
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettlersPanel({
  settlers,
  onAdd,
  onRevoke,
}: {
  settlers: SettlerRow[];
  onAdd: (address: string, feeBps: number) => Promise<void>;
  onRevoke: (address: string) => Promise<void>;
}) {
  const [addr, setAddr] = useState("");
  const [fee, setFee] = useState("200");

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="label">Wallet address</label>
          <input className="input w-full font-mono text-sm" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
        </div>
        <div className="w-28 space-y-1">
          <label className="label">Fee (bps)</label>
          <input className="input w-full" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <Button
          disabled={!isAddress(addr)}
          onClick={() => void onAdd(addr, Number(fee) || 200).then(() => setAddr(""))}
          className="gap-1"
        >
          <Scale className="h-4 w-4" /> Add settler
        </Button>
      </div>

      <div className="space-y-2">
        {settlers.map((s) => (
          <div key={s.address} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{s.username ? `@${s.username}` : shortAddr(s.address)}</p>
              <p className="font-mono text-xs text-muted-foreground">{s.address} · {s.feeBps} bps</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-semibold", s.approved ? "text-success" : "text-muted-foreground")}>
                {s.approved ? "Active" : "Revoked"}
              </span>
              {s.approved && (
                <Button size="sm" variant="danger" onClick={() => void onRevoke(s.address)}>
                  Revoke
                </Button>
              )}
              {!s.approved && (
                <Button size="sm" onClick={() => void onAdd(s.address, s.feeBps)}>Re-approve</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({
  mutes,
  onClear,
  clearing,
  onMute,
  onUnmute,
}: {
  mutes: ChatMuteRow[];
  onClear: () => void;
  clearing: boolean;
  onMute: (target: string, hours: number, permanent: boolean) => Promise<void>;
  onUnmute: (target: string) => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const [hours, setHours] = useState("24");
  const [permanent, setPermanent] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold">Clear global chat</p>
          <p className="text-xs text-muted-foreground">Permanently deletes all chat messages.</p>
        </div>
        <Button variant="danger" onClick={onClear} disabled={clearing} className="gap-1">
          <Trash2 className="h-4 w-4" /> Clear chat
        </Button>
      </div>

      <div className="card space-y-3 p-4">
        <p className="font-semibold">Mute user</p>
        <input className="input w-full font-mono text-sm" placeholder="0x…" value={target} onChange={(e) => setTarget(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
            Permanent
          </label>
          {!permanent && (
            <input className="input w-24" type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} />
          )}
          {!permanent && <span className="text-sm text-muted-foreground">hours</span>}
        </div>
        <Button
          disabled={!isAddress(target)}
          variant="danger"
          className="gap-1"
          onClick={() => void onMute(target, Number(hours) || 24, permanent).then(() => setTarget(""))}
        >
          <MessageCircleOff className="h-4 w-4" /> Mute
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Active mutes ({mutes.length})</h3>
        {mutes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mutes.</p>
        ) : (
          mutes.map((m) => (
            <div key={m.address} className="card flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium">{m.username ? `@${m.username}` : shortAddr(m.address)}</p>
                <p className="text-xs text-muted-foreground">
                  {m.permanent ? "Permanent" : `Until ${m.mutedUntil ? new Date(m.mutedUntil).toLocaleString() : "—"}`}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void onUnmute(m.address)}>Unmute</Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function ResolutionsPanel({
  items,
  onReview,
  pending,
}: {
  items: ResolutionItem[];
  onReview: (id: number, action: "approve" | "reject") => void;
  pending: boolean;
}) {
  if (items.length === 0) {
    return <p className="card p-6 text-sm text-muted-foreground">No resolutions waiting.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase">{r.subjectType}</span>
            {r.subjectLink ? (
              <Link href={r.subjectLink} className="font-medium hover:text-primary">{r.subjectTitle}</Link>
            ) : (
              <span className="font-medium">{r.subjectTitle}</span>
            )}
          </div>
          <p className="text-sm">Outcome: <span className="font-semibold text-success">{r.outcomeLabel}</span></p>
          {r.note && <p className="rounded-lg bg-muted/40 p-2 text-sm text-muted-foreground">{r.note}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onReview(r.id, "approve")} disabled={pending} className="gap-1">
              <Gavel className="h-4 w-4" /> Verify
            </Button>
            <Button size="sm" variant="danger" onClick={() => onReview(r.id, "reject")} disabled={pending} className="gap-1">
              <X className="h-4 w-4" /> Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResolverRequestsPanel({
  requests,
  onReview,
}: {
  requests: Array<{
    id: number;
    subjectTitle: string;
    subjectLink: string;
    requestedBy: string;
    suggested: string | null;
    reason: string | null;
  }>;
  onReview: (id: number, action: "approve" | "reject") => Promise<void>;
}) {
  if (requests.length === 0) {
    return <p className="card p-6 text-sm text-muted-foreground">No pending resolver requests.</p>;
  }
  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="card space-y-2 p-4">
          <Link href={r.subjectLink} className="font-medium hover:text-primary">{r.subjectTitle}</Link>
          <p className="text-xs text-muted-foreground">From {shortAddr(r.requestedBy)}</p>
          {r.suggested && <p className="text-sm">Suggested: <span className="font-mono">{shortAddr(r.suggested)}</span></p>}
          {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void onReview(r.id, "approve")} className="gap-1">
              <Check className="h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => void onReview(r.id, "reject")} className="gap-1">
              <X className="h-4 w-4" /> Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
