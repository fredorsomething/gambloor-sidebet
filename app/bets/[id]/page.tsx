import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { BetThumbnail } from "@/components/BetThumbnail";
import { CollapsibleBlurb } from "@/components/CollapsibleBlurb";
import { FeeBadge } from "@/components/FeeBadge";
import { Identity } from "@/components/profile/Identity";
import { BetDetailLive } from "@/components/BetDetailLive";
import { BetMatchup } from "@/components/BetMatchup";
import { Comments } from "@/components/Comments";
import { LiveBetStatusBadge } from "@/components/LiveBetStatusBadge";
import { BetResolutionLive } from "@/components/BetResolutionLive";
import { Resolvers } from "@/components/Resolvers";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import { explorerAddress, explorerTx } from "@/lib/chains";
import { isAdminAddress } from "@/lib/admin";
import {
  betShowMatchup,
  betShowOpenMatchup,
  resolveBetStatus,
} from "@/lib/betStatus";
import type { GetBetResponse } from "@/lib/types";
import { buildMetadataForPath } from "@/lib/og/metadata";
import {
  formatTimestamp,
  formatToken,
  fromNowUnix,
  shortAddr,
} from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return buildMetadataForPath(`/bets/${params.id}`);
}

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
  const { bet, onchain } = data;
  const resolverRequestEligible =
    resolveBetStatus(bet, onchain) === "Matched" &&
    !bet.customSettler &&
    isAdminAddress(bet.settler);

  const proposerStake = BigInt(bet.proposerStake || bet.amount || "0");
  const acceptorStake = BigInt(bet.acceptorStake || bet.amount || "0");
  const poolWei = proposerStake + acceptorStake;
  const pool = formatToken(poolWei, bet.decimals);
  const tokenSym = bet.tokenSymbol || "tokens";
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : [];
  const endDateSecs = bet.estimatedEndDate
    ? Math.floor(new Date(bet.estimatedEndDate).getTime() / 1000)
    : 0;
  const showMatchup = betShowMatchup(bet);
  const showOpenMatchup = betShowOpenMatchup(bet);
  const showBetLayout = showMatchup || showOpenMatchup;

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

      <div className="card relative p-6 space-y-3">
        <ShareLinkButton
          path={`/bets/${bet.id}`}
          className="absolute right-3 top-3 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        />
        <div className="flex items-center gap-2 pr-8">
          <TypeTag kind="sidebet" />
          <LiveBetStatusBadge id={bet.id} initialStatus={bet.status} />
          <FeeBadge feeBps={bet.feeBps} />
          <span className="text-xs text-muted-foreground">
            #{bet.onchainId} on chain {bet.chainId}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <BetThumbnail
            imageUrl={bet.imageUrl}
            title={bet.title}
            size="lg"
            fallback
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
              {bet.title}
            </h1>
            <CollapsibleBlurb
              text={bet.description}
              maxLines={3}
              className="mt-2"
            />
          </div>
        </div>

        {!showBetLayout && outcomes.length > 0 && (
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

        {!showBetLayout && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
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
            </div>
            {endDateSecs > 0 && (
              <div className="pt-1 text-xs text-muted-foreground">
                Estimated end: {formatTimestamp(endDateSecs)} ({fromNowUnix(endDateSecs)})
              </div>
            )}
          </>
        )}
      </div>

      <BetMatchup id={bet.id} initial={data} />

      <BetDetailLive id={bet.id} initial={data} />

      <BetResolutionLive id={bet.id} initial={data} />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-2 font-semibold">Terms</h2>
            <CollapsibleBlurb
              text={bet.terms}
              maxLines={4}
              className="text-foreground/90"
            />
          </section>

          <Comments basePath={`/api/bets/${bet.id}/comments`} />
        </div>

        <aside className="space-y-3">
          <Resolvers
            subjectType="bet"
            subjectId={bet.id}
            settler={bet.settler}
            customSettler={bet.customSettler}
            participants={[bet.proposer, bet.acceptor].filter(
              (a): a is string => !!a,
            )}
            requestEligible={resolverRequestEligible}
          />

          <section className="card p-5">
            <h3 className="font-semibold mb-3 text-sm">Participants</h3>
            <Party label="Proposer" addr={bet.proposer} />
            {bet.acceptor && (
              <Party label="Acceptor" addr={bet.acceptor} />
            )}
            {bet.customSettler ? (
              <Party label="Custom settler" addr={bet.customSettler} />
            ) : (
              <Party label="Settler" addr={bet.settler} />
            )}
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

      <section className="card p-4 text-sm">
        <h3 className="font-semibold">Smart contract</h3>
        <p className="mt-1 text-muted-foreground">
          Sidebet #{bet.onchainId} is escrowed in{" "}
          <a
            href={explorerAddress(bet.chainId, bet.escrowAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[hsl(var(--accent))] hover:underline"
          >
            {shortAddr(bet.escrowAddress)}
          </a>{" "}
          on Polygon —{" "}
          <a
            href={explorerAddress(bet.chainId, bet.escrowAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[hsl(var(--accent))] hover:underline"
          >
            view on Polygonscan
          </a>
          .
        </p>
      </section>
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

function Party({ label, addr }: { label: string; addr: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Identity address={addr} size={22} showAvatar={false} />
    </div>
  );
}
