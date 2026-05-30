import { getAddress, isAddress } from "viem";

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
  tokenSymbol?: string | null;
  stakeLabel?: string;
  /** Proposer's backed outcome label (bets). */
  proposerPosition?: string;
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
        proposerStake: true,
        amount: true,
        decimals: true,
        tokenSymbol: true,
        acceptorStake: true,
        outcomes: true,
        proposerOutcome: true,
      },
    });
    if (!bet) return null;

    const proposerUser = await prisma.user.findUnique({
      where: { address: getAddress(bet.proposer) },
      select: { username: true },
    });

    const stakeWei = BigInt(bet.proposerStake || bet.amount || "0");
    const stake = formatStake(stakeWei, bet.decimals, bet.tokenSymbol);
    const outcomes = Array.isArray(bet.outcomes) ? (bet.outcomes as string[]) : [];
    const proposerPosition = outcomes[bet.proposerOutcome]?.trim() || undefined;
    const proposerLabel = proposerUser?.username
      ? `@${proposerUser.username}`
      : "Proposer";

    return {
      kind: "bet",
      url: `/bets/${bet.id}`,
      id: bet.id,
      title: bet.title,
      subtitle: betPreviewSubtitle(proposerLabel, stake, proposerPosition),
      imageUrl: bet.imageUrl,
      status: bet.status,
      tokenSymbol: bet.tokenSymbol,
      stakeLabel: stake,
      proposerPosition,
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
    tokenSymbol: market.tokenSymbol,
  };
}

function betPreviewSubtitle(
  proposer: string,
  stake: string,
  position?: string,
): string {
  if (position) return `${proposer} · ${stake} on "${position}"`;
  return `${proposer} · ${stake}`;
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
