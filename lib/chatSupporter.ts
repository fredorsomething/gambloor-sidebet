/** Prefix for global chat Supporter badge announcements. */
export const SUPPORTER_MSG_PREFIX = "[[supporter]]";

export function isSupporterChatMessage(body: string): boolean {
  return body.startsWith(SUPPORTER_MSG_PREFIX);
}

export function supporterChatMessageText(body: string): string {
  return isSupporterChatMessage(body)
    ? body.slice(SUPPORTER_MSG_PREFIX.length)
    : body;
}

export function buildSupporterChatMessage(userLabel: string): string {
  return `${SUPPORTER_MSG_PREFIX}${userLabel} earned the Supporter badge!`;
}

/** Where "Support the platform here." links — opens badges on the viewer's profile. */
export const SUPPORTER_CHAT_LINK_HREF = "/support";
