import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { BetActions } from "@/components/BetActions";
import { BetDetailLive } from "@/components/BetDetailLive";
import { StatusBadge } from "@/components/ui/badge";
import { explorerAddress, explorerTx } from "@/lib/chains";
import {
  formatTimestamp,
  formatToken,
  fromNowUnix,
  shortAddr,
} from "@/lib/utils";
import type { GetBetResponse } from "@/lib/types";

async function fetchBet(id: string): Promise<GetBetResponse | null> {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) return null;
  const res = await fetch(`${proto}://${host}/api/bets/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as GetBetResponse;
}

export default async function BetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await fetchBet(params.id);
  if (!data) notFound();
  const { bet } = data;

  const stake = formatToken(BigInt(bet.amount), bet.decimals);
  const pool = formatToken(BigInt(bet.amount) * 2n, bet.decimals);
  const tokenSym = bet.tokenSymbol || "tokens";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All markets
        </Link>
      </div>

      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={bet.status} />
          <span className="text-xs text-muted-foreground">
            #{bet.onchainId} on chain {bet.chainId}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
          {bet.title}
        </h1>
        <p className="text-muted-foreground">{bet.description}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <Stat label="Stake / side" value={`${stake} ${tokenSym}`} />
          <Stat label="Total pool" value={`${pool} ${tokenSym}`} />
          <Stat label="Settler fee" value={`${(bet.feeBps / 100).toFixed(2)}%`} />
          <Stat
            label="Settle by"
            value={
              bet.settleDeadline
                ? `${fromNowUnix(BigInt(bet.settleDeadline))}`
                : "no deadline"
            }
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-2">Terms</h2>
            <pre className="text-sm text-foreground/90 whitespace-pre-wrap break-words font-sans leading-relaxed">
              {bet.terms}
            </pre>
          </section>

          <BetDetailLive id={bet.id} initial={data}>
            {(live) => <BetActions bet={live.bet} />}
          </BetDetailLive>
        </div>

        <aside className="space-y-3">
          <section className="card p-5">
            <h3 className="font-semibold mb-3 text-sm">Participants</h3>
            <Party label="Proposer" addr={bet.proposer} chainId={bet.chainId} />
            {bet.acceptor && (
              <Party
                label="Acceptor"
                addr={bet.acceptor}
                chainId={bet.chainId}
              />
            )}
            <Party label="Settler" addr={bet.settler} chainId={bet.chainId} />
          </section>

          <section className="card p-5 text-xs space-y-2">
            <h3 className="font-semibold text-sm">On-chain</h3>
            <Row
              label="Token"
              value={
                <a
                  href={explorerAddress(bet.chainId, bet.token)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-[hsl(var(--accent))]"
                >
                  {tokenSym} · {shortAddr(bet.token)}
                </a>
              }
            />
            <Row
              label="Escrow"
              value={
                <a
                  href={explorerAddress(bet.chainId, bet.escrowAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-[hsl(var(--accent))]"
                >
                  {shortAddr(bet.escrowAddress)}
                </a>
              }
            />
            {bet.txHash && (
              <Row
                label="Create tx"
                value={
                  <a
                    href={explorerTx(bet.chainId, bet.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:text-[hsl(var(--accent))]"
                  >
                    {shortAddr(bet.txHash, 8, 6)}
                  </a>
                }
              />
            )}
            <Row label="Created" value={formatTimestamp(Math.floor(new Date(bet.createdAt).getTime() / 1000))} />
            {bet.acceptDeadline && (
              <Row
                label="Accept by"
                value={`${formatTimestamp(BigInt(bet.acceptDeadline))} (${fromNowUnix(BigInt(bet.acceptDeadline))})`}
              />
            )}
            {bet.settleDeadline && (
              <Row
                label="Settle by"
                value={`${formatTimestamp(BigInt(bet.settleDeadline))} (${fromNowUnix(BigInt(bet.settleDeadline))})`}
              />
            )}
            <Row
              label="Terms hash"
              value={
                <span className="font-mono break-all" title={bet.termsHash}>
                  {shortAddr(bet.termsHash, 10, 6)}
                </span>
              }
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

function Party({
  label,
  addr,
  chainId,
}: {
  label: string;
  addr: string;
  chainId: number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <a
        href={explorerAddress(chainId, addr)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-sm hover:text-[hsl(var(--accent))]"
      >
        {shortAddr(addr)}
      </a>
    </div>
  );
}
