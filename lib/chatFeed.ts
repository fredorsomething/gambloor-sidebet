/** Prefixes for global chat feed announcements (stripped before display). */
export const FEED_MARKET_PREFIX = "[[feed:market]]";
export const FEED_BET_MATCHED_PREFIX = "[[feed:bet-matched]]";
export const FEED_BET_SETTLED_PREFIX = "[[feed:bet-settled]]";

export type FeedChatKind = "market" | "bet-matched" | "bet-settled";

const PREFIX_BY_KIND: Record<FeedChatKind, string> = {
  market: FEED_MARKET_PREFIX,
  "bet-matched": FEED_BET_MATCHED_PREFIX,
  "bet-settled": FEED_BET_SETTLED_PREFIX,
};

export type ParsedFeedChatMessage = {
  kind: FeedChatKind;
  text: string;
  href?: string;
};

export function isFeedChatMessage(body: string): boolean {
  return body.startsWith("[[feed:");
}

export function buildFeedChatMessage(
  kind: FeedChatKind,
  text: string,
  href: string,
): string {
  return `${PREFIX_BY_KIND[kind]}${text}|${href}`;
}

export function parseFeedChatMessage(body: string): ParsedFeedChatMessage | null {
  for (const kind of Object.keys(PREFIX_BY_KIND) as FeedChatKind[]) {
    const prefix = PREFIX_BY_KIND[kind];
    if (!body.startsWith(prefix)) continue;
    const rest = body.slice(prefix.length);
    const pipe = rest.lastIndexOf("|");
    if (pipe < 0) return { kind, text: rest };
    return {
      kind,
      text: rest.slice(0, pipe),
      href: rest.slice(pipe + 1) || undefined,
    };
  }
  return null;
}

export function feedChatMessageClass(kind: FeedChatKind): string {
  switch (kind) {
    case "market":
      return "text-primary";
    case "bet-matched":
      return "text-warning";
    case "bet-settled":
      return "text-success";
  }
}
