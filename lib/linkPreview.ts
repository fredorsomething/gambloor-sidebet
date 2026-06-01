import { getAddress, isAddress } from "viem";

import type { BetStatusName } from "@/lib/abi";
import { acceptorTakeEconomics, sidebetPayoutWei } from "@/lib/betEconomics";
import { resolveBetStatus } from "@/lib/betStatus";
import { prisma } from "@/lib/db";
import { computeUserStats, type StatBet } from "@/lib/stats";

export type LinkPreviewKind = "site" | "profile" | "bet" | "market";

export type LinkPreviewData = {
  kind: LinkPreviewKind;
  url: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  /** Profile */
  address?: string;
  username?: string | null;
  verified?: boolean;
  pnl?: number;
  joinedAt?: string;
  /** Bet / market */
  id?: number;
  status?: string;
  /** Busts OG image CDN caches when lifecycle state changes. */
  ogImageVersion?: string;
  tokenSymbol?: string | null;
  stakeLabel?: string;
  /** Proposer's backed outcome label (bets). */
  proposerPosition?: string;
  /** Bet OG card: resolved lifecycle + both sides. */
  betMatchup?: {
    proposer: BetPartyPreview;
    acceptor: BetPartyPreview;
    poolLabel?: string;
    /** Open bets: acceptor-side stake and net profit. */
    youBetLabel?: string;
    toWinLabel?: string;
    /** Settled: "@user won 8 USDC.e" line for meta text. */
    resultLabel?: string;
  };
};

export type BetPartyPreview = {
  label: string;
  stakeLabel: string;
  outcomeLabel?: string;
  address?: string | null;
  avatarUrl?: string | null;
  /** Settled bets: winning party. */
  isWinner?: boolean;
  /** Settled bets: gross payout to the winner (pool minus fee). */
  payoutLabel?: string;
};

const TRAILING_PUNCT = /[)\].,;:!?]+$/;

const SITE_HOSTS = new Set([
  "sidebet.lol",
  "www.sidebet.lol",
  "localhost",
  "127.0.0.1",
]);

function isOurHost(host: string): boolean {
  const h = host.toLowerCase();
  if (SITE_HOSTS.has(h)) return true;
  return h.endsWith(".vercel.app");
}

export function normalizeChatUrl(raw: string): string {
  let u = raw.trim().replace(TRAILING_PUNCT, "");
  if (u.startsWith("www.")) u = `https://${u}`;
  if (/^sidebet\.lol\//i.test(u)) u = `https://${u}`;
  return u;
}

/** Map pasted URLs (incl. /opengraph-image) to a canonical page path. */
export function normalizePreviewUrl(raw: string): string {
  let u = normalizeChatUrl(raw);
  if (u.startsWith("/")) {
    return u.split(/[?#]/)[0]!.replace(/\/opengraph-image$/, "") || "/";
  }
  try {
    const url = new URL(u);
    url.pathname = url.pathname.replace(/\/opengraph-image$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return u.split(/[?#]/)[0]!.replace(/\/opengraph-image$/, "") || u;
  }
}

/** Pull http(s) and root-relative paths from message text. */
export function extractUrls(text: string): string[] {
  const found = new Set<string>();
  const httpRe = /https?:\/\/[^\s<>"']+/gi;
  for (const m of text.match(httpRe) ?? []) {
    found.add(normalizeChatUrl(m));
  }
  const pathRe = /(?:^|\s)(\/(?:bets|u|markets|leaderboard|users|create|me|swap|how-it-works)[^\s<>"']*)/gi;
  for (const m of text.match(pathRe) ?? []) {
    const path = normalizePreviewUrl(m.trim());
    if (path.startsWith("/")) found.add(path);
  }
  const bareRe =
    /(?:^|\s)((?:sidebet\.lol|www\.sidebet\.lol)\/(?:bets|u|markets)[^\s<>"']*)/gi;
  for (const m of text.match(bareRe) ?? []) {
    found.add(normalizePreviewUrl(m.trim()));
  }
  return [...found];
}

export type ParsedInternalLink =
  | { kind: "site"; path: string }
  | { kind: "profile"; handle: string }
  | { kind: "bet"; id: number }
  | { kind: "market"; id: number };

export function parseInternalLink(input: string): ParsedInternalLink | null {
  const raw = normalizePreviewUrl(input);
  let path: string;
  try {
    if (raw.startsWith("/")) {
      path = raw.split(/[?#]/)[0] || "/";
    } else if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      if (!isOurHost(url.hostname)) return null;
      path = url.pathname.replace(/\/$/, "") || "/";
    } else {
      return null;
    }
  } catch {
    return null;
  }

  path = path.replace(/\/opengraph-image$/, "");

  const bet = path.match(/^\/bets\/(\d+)$/);
  if (bet) return { kind: "bet", id: Number(bet[1]) };

  const market = path.match(/^\/markets\/(\d+)$/);
  if (market) return { kind: "market", id: Number(market[1]) };

  const profile = path.match(/^\/u\/([^/]+)$/);
  if (profile) return { kind: "profile", handle: decodeURIComponent(profile[1]) };

  return { kind: "site", path };
}

const SITE_PAGE_LABELS: Record<string, string> = {
  "/": "Markets",
  "/leaderboard": "Leaderboard",
  "/users": "Directory",
  "/create": "Create a bet",
  "/me": "My positions",
  "/swap": "Swap tokens",
  "/how-it-works": "How it works",
  "/terms": "Terms of Service",
  "/privacy": "Privacy Policy",
  "/messages": "Messages",
};

function siteTitleForPath(path: string): string {
  return SITE_PAGE_LABELS[path] ?? "Sidebet";
}

export async function resolveLinkPreview(
  input: string,
): Promise<LinkPreviewData | null> {
  const parsed = parseInternalLink(input);
  if (!parsed) return null;

  const href = input.startsWith("/")
    ? input.split(/[?#]/)[0]!
    : normalizeChatUrl(input).split(/[?#]/)[0]!;

  if (parsed.kind === "site") {
    return {
      kind: "site",
      url: parsed.path,
      title: siteTitleForPath(parsed.path),
      subtitle: "sidebet.lol",
      imageUrl: "/favicon.png",
    };
  }

  if (parsed.kind === "profile") {
    const handle = parsed.handle.replace(/^@/, "");
    let address: string;
    let user = isAddress(handle)
      ? await prisma.user.findUnique({
          where: { address: getAddress(handle) },
          select: {
            address: true,
            username: true,
            avatarUrl: true,
            verified: true,
            createdAt: true,
          },
        })
      : await prisma.user.findFirst({
          where: { username: { equals: handle, mode: "insensitive" } },
          select: {
            address: true,
            username: true,
            avatarUrl: true,
            verified: true,
            createdAt: true,
          },
        });

    if (!user && !isAddress(handle)) {
      const past = await prisma.usernameHistory.findFirst({
        where: { username: handle.toLowerCase() },
        orderBy: { createdAt: "desc" },
      });
      if (past) {
        address = getAddress(past.address);
        user = await prisma.user.findUnique({
          where: { address },
          select: {
            address: true,
            username: true,
            avatarUrl: true,
            verified: true,
            createdAt: true,
          },
        });
      } else {
        return null;
      }
    } else {
      address = getAddress(user?.address ?? handle);
    }

    const bets = await prisma.bet.findMany({
      where: {
        OR: [
          { proposer: { equals: address, mode: "insensitive" } },
          { acceptor: { equals: address, mode: "insensitive" } },
        ],
      },
      select: {
        proposer: true,
        acceptor: true,
        amount: true,
        proposerStake: true,
        acceptorStake: true,
        decimals: true,
        feeBps: true,
        status: true,
        winner: true,
      },
    });
    const pnl = computeUserStats(bets as StatBet[], address).pnl;
    const slug = user?.username ?? address;
    const joinedFull = user?.createdAt ? formatJoinDate(user.createdAt) : null;
    // Discord meta text — join date only; PnL lives on the OG image card.
    const subtitle = joinedFull ? `Date joined: ${joinedFull}` : undefined;

    return {
      kind: "profile",
      url: `/u/${slug}`,
      title: user?.username ? `@${user.username}` : address.slice(0, 6) + "…" + address.slice(-4),
      subtitle,
      imageUrl: user?.avatarUrl ?? null,
      address,
      username: user?.username ?? null,
      verified: user?.verified ?? false,
      pnl,
      joinedAt: joinedFull ?? undefined,
    };
  }

  if (parsed.kind === "bet") {
    const bet = await prisma.bet.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        status: true,
        proposer: true,
        acceptor: true,
        intendedAcceptor: true,
        escrowRevisionNeeded: true,
        proposerStake: true,
        amount: true,
        decimals: true,
        tokenSymbol: true,
        acceptorStake: true,
        outcomes: true,
        proposerOutcome: true,
        acceptorOutcome: true,
        winner: true,
        feeBps: true,
        updatedAt: true,
      },
    });
    if (!bet) return null;

    const lookupAddresses = [
      getAddress(bet.proposer),
      ...(bet.acceptor ? [getAddress(bet.acceptor)] : []),
      ...(bet.intendedAcceptor ? [getAddress(bet.intendedAcceptor)] : []),
    ];
    const users = await prisma.user.findMany({
      where: { address: { in: lookupAddresses } },
      select: { address: true, username: true, avatarUrl: true },
    });
    const userFor = (address: string) =>
      users.find((u) => u.address.toLowerCase() === address.toLowerCase());
    const usernameFor = (address: string) =>
      userFor(address)?.username ?? null;
    const avatarFor = (address: string) => userFor(address)?.avatarUrl ?? null;

    const proposerStakeWei = BigInt(bet.proposerStake || bet.amount || "0");
    const acceptorStakeWei = BigInt(bet.acceptorStake || bet.amount || "0");
    const proposerStake = formatStake(
      proposerStakeWei,
      bet.decimals,
      bet.tokenSymbol,
    );
    const acceptorStake = formatStake(
      acceptorStakeWei,
      bet.decimals,
      bet.tokenSymbol,
    );
    const poolLabel = formatStake(
      proposerStakeWei + acceptorStakeWei,
      bet.decimals,
      bet.tokenSymbol,
    );
    const outcomes = Array.isArray(bet.outcomes) ? (bet.outcomes as string[]) : [];
    const proposerPosition = outcomes[bet.proposerOutcome]?.trim() || undefined;
    const acceptorPosition = outcomes[bet.acceptorOutcome]?.trim() || undefined;
    const proposerLabel = partyLabel(bet.proposer, usernameFor(bet.proposer));
    const resolvedStatus = resolveBetStatus({
      status: bet.status as BetStatusName,
      acceptor: bet.acceptor,
      escrowRevisionNeeded: bet.escrowRevisionNeeded,
    } as Parameters<typeof resolveBetStatus>[0]);
    const isOpen = resolvedStatus === "Open";
    const isSettled = resolvedStatus === "Settled";
    const isRefunded = resolvedStatus === "Refunded";
    const isMatched =
      resolvedStatus === "Matched" || isSettled || isRefunded;

    const acceptorAddress = bet.acceptor?.trim() || null;
    const acceptorSideLabel = acceptorAddress
      ? partyLabel(acceptorAddress, usernameFor(acceptorAddress))
      : isOpen
        ? "Open"
        : bet.intendedAcceptor
          ? partyLabel(bet.intendedAcceptor, usernameFor(bet.intendedAcceptor))
          : "Open";
    const acceptorPartyAddress = acceptorAddress ?? (isOpen ? null : bet.intendedAcceptor?.trim() ?? null);

    const payoutWei = sidebetPayoutWei(
      proposerStakeWei,
      acceptorStakeWei,
      bet.feeBps ?? 0,
    );
    const payoutLabel = formatStake(payoutWei, bet.decimals, bet.tokenSymbol);
    const takeEconomics = acceptorTakeEconomics(
      proposerStakeWei,
      acceptorStakeWei,
      bet.feeBps ?? 0,
    );
    const youBetLabel = formatStake(
      takeEconomics.youBetWei,
      bet.decimals,
      bet.tokenSymbol,
    );
    const toWinLabel = formatStake(
      takeEconomics.toWinWei,
      bet.decimals,
      bet.tokenSymbol,
    );
    const proposerWon =
      isSettled && eqAddr(bet.winner, bet.proposer);
    const acceptorWon =
      isSettled && eqAddr(bet.winner, acceptorAddress);
    const winnerLabel = proposerWon
      ? proposerLabel
      : acceptorWon
        ? acceptorSideLabel
        : undefined;

    const betMatchup = {
      proposer: {
        label: proposerLabel,
        stakeLabel: proposerStake,
        outcomeLabel: proposerPosition,
        address: bet.proposer,
        avatarUrl: avatarFor(bet.proposer),
        isWinner: proposerWon || undefined,
        payoutLabel: proposerWon ? payoutLabel : undefined,
      },
      acceptor: {
        label: acceptorSideLabel,
        stakeLabel: acceptorStake,
        outcomeLabel: acceptorPosition,
        address: acceptorPartyAddress,
        avatarUrl: acceptorPartyAddress
          ? avatarFor(acceptorPartyAddress)
          : null,
        isWinner: acceptorWon || undefined,
        payoutLabel: acceptorWon ? payoutLabel : undefined,
      },
      poolLabel: isMatched ? poolLabel : undefined,
      youBetLabel: isOpen ? youBetLabel : undefined,
      toWinLabel: isOpen ? toWinLabel : undefined,
      resultLabel:
        isSettled && winnerLabel
          ? `${winnerLabel} won ${payoutLabel}`
          : isRefunded
            ? "Refunded — stakes returned"
            : undefined,
    };

    return {
      kind: "bet",
      url: `/bets/${bet.id}`,
      id: bet.id,
      title: bet.title,
      subtitle: betMatchupSubtitle(betMatchup, resolvedStatus),
      imageUrl: bet.imageUrl,
      status: resolvedStatus,
      ogImageVersion: betOgImageVersion(resolvedStatus, bet.updatedAt, bet.winner),
      tokenSymbol: bet.tokenSymbol,
      stakeLabel: proposerStake,
      proposerPosition,
      betMatchup,
    };
  }

  const market = await prisma.market.findUnique({
    where: { id: parsed.id },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      status: true,
      tokenSymbol: true,
      creator: true,
      updatedAt: true,
    },
  });
  if (!market) return null;

  const creator = await prisma.user.findUnique({
    where: { address: getAddress(market.creator) },
    select: { username: true },
  });

  return {
    kind: "market",
    url: `/markets/${market.id}`,
    id: market.id,
    title: market.title,
    subtitle: `${creator?.username ? `@${creator.username}` : "Creator"} · ${market.status}`,
    imageUrl: market.imageUrl,
    status: market.status,
    ogImageVersion: `${market.status}-${market.updatedAt.getTime()}`,
    tokenSymbol: market.tokenSymbol,
  };
}

function betOgImageVersion(
  status: BetStatusName,
  updatedAt: Date,
  winner: string | null,
): string {
  const winnerKey = winner?.toLowerCase() ?? "none";
  return `${status}-${updatedAt.getTime()}-${winnerKey}`;
}

function partyLabel(address: string, username: string | null): string {
  if (username) return `@${username}`;
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function betMatchupSubtitle(
  matchup: NonNullable<LinkPreviewData["betMatchup"]>,
  status: BetStatusName,
): string {
  if (matchup.resultLabel) return matchup.resultLabel;
  if (status === "Open" && matchup.youBetLabel && matchup.toWinLabel) {
    const side = matchup.acceptor.outcomeLabel
      ? `${matchup.acceptor.outcomeLabel} · `
      : "";
    return `${matchup.proposer.label} · ${side}You bet ${matchup.youBetLabel} to win ${matchup.toWinLabel}`;
  }
  const left = `${matchup.proposer.label} · ${matchup.proposer.stakeLabel}`;
  const right = `${matchup.acceptor.label} · ${matchup.acceptor.stakeLabel}`;
  if (status === "Matched") {
    return `${left} vs ${right} · Matched`;
  }
  return `${left} vs ${right}`;
}

function eqAddr(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function formatStake(wei: bigint, decimals: number, symbol: string | null): string {
  const n = Number(wei) / 10 ** decimals;
  const formatted = n.toLocaleString(undefined, {
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
  return symbol ? `${formatted} ${symbol}` : formatted;
}

function formatJoinDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Split message into alternating text / url segments for rendering. */
export function splitMessageWithUrls(text: string): Array<{ type: "text" | "url"; value: string }> {
  if (!text.trim()) return [];
  const re = /(https?:\/\/[^\s<>"']+|\/(?:bets|u|markets|leaderboard|users|create|me|swap|how-it-works)[^\s<>"']*)/gi;
  const parts: Array<{ type: "text" | "url"; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: "text", value: text.slice(last, idx) });
    parts.push({ type: "url", value: normalizeChatUrl(m[0]) });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}
