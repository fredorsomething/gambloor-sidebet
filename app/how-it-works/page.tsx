import {
  CheckCircle2,
  ExternalLink,
  Gavel,
  Handshake,
  Layers,
  Lock,
  ShieldCheck,
  Swords,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  ESCROW_ADDRESS,
  ESCROW_V2_ADDRESS,
  explorerAddress,
  POLYGON_CHAIN_ID,
} from "@/lib/chains";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How sidebets work — making rules, matching, negotiating, and settlement.",
};

export default function HowItWorksPage() {
  const escrowV2Url = ESCROW_V2_ADDRESS
    ? explorerAddress(POLYGON_CHAIN_ID, ESCROW_V2_ADDRESS)
    : null;
  const escrowV1Url = ESCROW_ADDRESS
    ? explorerAddress(POLYGON_CHAIN_ID, ESCROW_ADDRESS)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">How it works</h1>
        <p className="text-muted-foreground">
          sidebet lets you bet on anything with anyone. Stakes are escrowed in
          on-chain smart contracts and only released when the outcome is
          declared — so neither side can run off with the pot. Here&apos;s the
          quick tour.
        </p>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/onboarding">Onboarding cards</Link>
        </Button>
      </header>

      {/* Two formats */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Two ways to bet</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-2 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Swords className="h-4 w-4" />
              </span>
              <h3 className="font-semibold">Sidebets (1v1)</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              A head-to-head wager between two people. You write the terms, pick
              your side and stake, choose who settles it, and post it. Anyone can
              take the other side — or negotiate the terms first. Asymmetric
              stakes (different amounts per side) let you set the odds.
            </p>
          </div>
          <div className="card space-y-2 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="h-4 w-4" />
              </span>
              <h3 className="font-semibold">Markets (order book)</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              A public prediction market where many people trade shares of each
              outcome on a shared order book. Prices move with demand and reflect
              the crowd&apos;s implied probability. Buy low, sell high, or hold to
              resolution for a full payout if you&apos;re right.
            </p>
          </div>
        </div>
      </section>

      {/* Sidebet lifecycle */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">A sidebet, step by step</h2>
        <ol className="space-y-3">
          <Step
            n={1}
            title="Write the rules"
            body="Set a clear title, description, and resolution terms — exactly what makes each outcome win. Pick your outcomes (Yes/No or custom), the side you back, the token, and how much each side stakes."
          />
          <Step
            n={2}
            title="Pick a settler"
            body="Choose a neutral party from the approved settlers to declare the winner when it's over. They charge a small fee on the pool. You can't settle your own bet."
          />
          <Step
            n={3}
            title="Post & escrow"
            body="Creating the bet pulls your stake into the escrow contract. Your offer is now live for anyone to take."
          />
          <Step
            n={4}
            title="Match or negotiate"
            body="Someone can take the other side directly — or send a counter-offer with revised stakes/odds or tweaked terms. If you accept their terms, you relaunch the bet with the agreed deal pre-filled. When the taker funds their side, both stakes are locked and the bet is matched."
          />
          <Step
            n={5}
            title="Settle & pay out"
            body="After the event, the settler reads the terms and declares the winning outcome on-chain. The winner receives the pool minus the settler fee. If the winning outcome is one nobody backed, both sides are refunded with no fee."
          />
        </ol>
      </section>

      {/* Negotiation callout */}
      <section className="card space-y-2 p-5">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Negotiating a sidebet</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Like the premise but not the odds? On any open sidebet, hit{" "}
          <span className="font-medium text-foreground">Propose new terms</span>{" "}
          to send the proposer your version — different stakes, or revised
          resolution terms, plus a note. They&apos;ll be notified and can accept,
          decline, or ignore it. Accepting locks in the agreed terms and lets the
          proposer relaunch the bet for you to take. It&apos;s fine-tuning a deal
          both sides are happy with before any money moves.
        </p>
      </section>

      {/* Market lifecycle */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">A market, step by step</h2>
        <ol className="space-y-3">
          <Step
            n={1}
            title="Create & get approved"
            body="Anyone can propose a market with a question, outcomes, and resolution terms. New markets go live immediately and are open for trading on the order book."
          />
          <Step
            n={2}
            title="Trade the order book"
            body="Place limit orders to buy or sell shares of an outcome at a price you choose, or take existing liquidity instantly. Yes and No sides are shown as one unified book, so you always see the full picture."
          />
          <Step
            n={3}
            title="Manage your position"
            body="Track your shares, average cost basis, open orders, and trade history on each market. Cancel resting orders any time."
          />
          <Step
            n={4}
            title="Resolution"
            body="When the question is answered, the market's settler (or an admin) declares the winning outcome. Winning shares redeem for the full payout; losing shares expire worthless."
          />
        </ol>
      </section>

      {/* Settlement / settlers */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Who resolves bets?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-2 p-5">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Settlers you choose</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Every bet names a settler up front — a neutral, approved party who
              declares the outcome. You always know who has the gavel before you
              put up a stake, and they earn a small, transparent fee for the call.
            </p>
          </div>
          <div className="card space-y-2 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Admins & verifiers</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Admins approve new markets and maintain the roster of trusted
              settlers. On sidebets, both bettors declare the winning outcome —
              if they agree, payout is immediate; if they disagree, a verifier
              reviews before settlement. Markets still use admin verification
              before payout.
            </p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Your funds stay on-chain</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <Bullet>
            Stakes live in open-source escrow smart contracts on Polygon — sidebet
            never custodies your money.{" "}
            {escrowV2Url ? (
              <a
                href={escrowV2Url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                View SidebetEscrowV2 on Polygonscan
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {escrowV1Url ? (
              <>
                {escrowV2Url ? " · " : null}
                <a
                  href={escrowV1Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  legacy v1 contract
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </Bullet>
          <Bullet>
            Bet terms are committed on-chain as a hash, so the rules can&apos;t be
            changed after the fact.
          </Bullet>
          <Bullet>
            We only index human-readable details (titles, comments, profiles)
            off-chain to make browsing fast. The contract is always the source of
            truth for funds and outcomes.
          </Bullet>
          <Bullet>
            Your profile, stats, PnL, and reputation are tied to your wallet
            address — change your username any time without losing a thing.
          </Bullet>
        </ul>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted/30 p-8 text-center">
        <Users className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-semibold">Ready to make a bet?</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Spin up a 1v1 sidebet or a public market in a couple of minutes.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Link
            href="/create?type=sidebet"
            className="rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--primary))]/90"
          >
            Create a sidebet
          </Link>
          <Link
            href="/home"
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted/60"
          >
            Browse markets
          </Link>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="card flex gap-4 p-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {n}
      </span>
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}
