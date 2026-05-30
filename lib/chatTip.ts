/** Prefix for global chat tip announcements (stripped before display). */
export const TIP_MSG_PREFIX = "[[tip]]";

export function isTipChatMessage(body: string): boolean {
  return body.startsWith(TIP_MSG_PREFIX);
}

export function tipChatMessageText(body: string): string {
  return isTipChatMessage(body) ? body.slice(TIP_MSG_PREFIX.length) : body;
}
