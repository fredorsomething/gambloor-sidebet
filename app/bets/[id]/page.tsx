import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { BetThumbnail } from "@/components/BetThumbnail";
import { BetDetailLive } from "@/components/BetDetailLive";
import { Comments } from "@/components/Comments";
import { ProposeResolutionButton } from "@/components/ProposeResolutionButton";
import { Identity } from "@/components/profile/Identity";
import { StatusBadge } from "@/components/ui/badge";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
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

  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const poolWei = proposerStake + acceptorStake;
  const pool = formatToken(poolWei, bet.decimals);
  const tokenSym = bet.tokenSymbol || "tokens";
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const endDateSecs = bet.estimatedEndDate
    ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to feed
        </Link>
      </div>

      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <TypeTag kind="sidebet" />
          <StatusBadge status={bet.status} />
          <span className="text-xs text-muted-foreground">
            #{bet.onchainId} on chain {bet.chainId}
          </span>
        </div>
        {bet.imageUrl && (
          <BetThumbnail
            imageUrl={bet.imageUrl}
            title={bet.title}
            size="lg"
            className="mb-4 w-full max-w-none"
          />
        )}
        <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
          {bet.title}
        </h1>
        <p className="text-muted-foreground">{bet.description}</p>

        {outcomes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {outcomes.map((o, i) => (
              <span
                key={i}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  i === bet.proposerOutcome
                    ? "bg-success/15 text-success"
                    : i === bet.acceptorOutcome
                      ? "bg-danger/15 text-danger"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {o}
                {i === bet.proposerOutcome && " · proposer"}
                {i === bet.acceptorOutcome && " · acceptor"}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <Stat
            label="Proposer stake"
            value={
              <>
                {formatToken(proposerStake, bet.decimals)}{" "}
                <TokenSymbol symbol={tokenSym} size={13} />
              </>
            }
          />
          <Stat
            label="Acceptor stake"
            value={
              <>
                {formatToken(acceptorStake, bet.decimals)}{" "}
                <TokenSymbol symbol={tokenSym} size={13} />
              </>
            }
          />
          <Stat
            label="Total pool"
            value={
              <>
                {pool} <TokenSymbol symbol={tokenSym} size={13} />
              </>
            }
          />
          <Stat label="Settler fee" value={`${(bet.feeBps / 100).toFixed(2)}%`} />
        </div>
        {endDateSecs > 0 && (
          <div className="pt-1 text-xs text-muted-foreground">
            Estimated end: {formatTimestamp(endDateSecs)} ({fromNowUnix(endDateSecs)})
          </div>
        )}
      </div>

      {/* Primary action up top so taking the bet is obvious without scrolling. */}
      <BetDetailLive id={bet.id} initial={data} />

      {bet.status !== "Cancelled" && bet.status !== "Refunded" && (
        <ProposeResolutionButton
          subjectType="bet"
          subjectId={bet.id}
          outcomes={outcomes}
          participants={[bet.proposer, bet.acceptor, bet.settler].filter(
            (a): a is string => !!a,
          )}
        />
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold mb-2">Terms</h2>
            <pre className="text-sm text-foreground/90 whitespace-pre-wrap break-words font-sans leading-relaxed">
              {bet.terms}
            </pre>
          </section>

          <Comments basePath={`/api/bets/${bet.id}/comments`} />
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
                  className="inline-flex items-center gap-1 font-mono hover:text-[hsl(var(--accent))]"
                >
                  <TokenIcon symbol={tokenSym} size={13} />
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
            {endDateSecs > 0 && (
              <Row
                label="Est. end"
                value={`${formatTimestamp(endDateSecs)} (${fromNowUnix(endDateSecs)})`}
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

      {(bet.status === "Matched" || bet.acceptor) && (
        <section className="card p-6">
          <h2 className="mb-4 text-sm font-semibold">The bet</h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
              <span className="label">Proposer</span>
              <Identity address={bet.proposer} size={28} weight="semibold" />
              {outcomes[bet.proposerOutcome] && (
                <span className="text-xs text-muted-foreground">
                  backs {outcomes[bet.proposerOutcome]}
                </span>
              )}
            </div>
            <div className="shrink-0 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              vs
            </div>
            {bet.acceptor && (
              <div className="flex flex-1 flex-col items-center gap-2 text-center sm:items-end sm:text-right">
                <span className="label">Acceptor</span>
                <Identity address={bet.acceptor} size={28} weight="semibold" />
                {outcomes[bet.acceptorOutcome] && (
                  <span className="text-xs text-muted-foreground">
                    backs {outcomes[bet.acceptorOutcome]}
                  </span>
                )}
              </div>
            )}
          </div>
          {endDateSecs > 0 && (
            <div className="mt-5 border-t border-border pt-4 text-center text-sm">
              <span className="text-muted-foreground">
                {bet.status === "Matched" ? "Time until settlement" : "Estimated end"}
              </span>
              <div className="mt-1 text-lg font-semibold">
                {fromNowUnix(endDateSecs)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatTimestamp(endDateSecs)}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1 inline-flex items-center font-mono text-base">
        {value}
      </div>
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
