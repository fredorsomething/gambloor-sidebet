import { prisma } from "@/lib/db";

export type NotificationType =
  | "comment"
  | "reply"
  | "resolution_proposed"
  | "resolution_verified"
  | "resolution_rejected"
  | "market_approved"
  | "market_rejected"
  | "bet_settled"
  | "market_resolved"
  | "deposit"
  | "withdrawal"
  | "status";

export type NewNotification = {
  recipient: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/**
 * Persist a notification for a single recipient. Failures are swallowed so a
 * notification never breaks the primary write that triggered it.
 */
export async function notify(n: NewNotification): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        recipient: n.recipient.toLowerCase(),
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      },
    });
  } catch (err) {
    console.warn("notify failed", err);
  }
}

/** Fan out a notification to several recipients, de-duped + non-empty only. */
export async function notifyMany(
  recipients: (string | null | undefined)[],
  n: Omit<NewNotification, "recipient">,
): Promise<void> {
  const unique = Array.from(
    new Set(
      recipients
        .filter((r): r is string => !!r)
        .map((r) => r.toLowerCase()),
    ),
  );
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((recipient) => ({
        recipient,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      })),
    });
  } catch (err) {
    console.warn("notifyMany failed", err);
  }
}
