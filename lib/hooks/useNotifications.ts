"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { jsonFetch } from "@/lib/fetcher";

export type AppNotification = {
  id: number;
  recipient: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  items: AppNotification[];
  unread: number;
};

/** Polls the caller's notifications (authed) and exposes a mark-read action. */
export function useNotifications() {
  const { authenticated, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const qc = useQueryClient();
  const lower = address?.toLowerCase();

  const query = useQuery<NotificationsResponse>({
    queryKey: ["notifications", lower],
    enabled: !!address && authenticated,
    refetchInterval: 30_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { items: [], unread: 0 };
      return jsonFetch<NotificationsResponse>(
        `/api/notifications?address=${address}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids?: number[]) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in");
      return jsonFetch<{ unread: number }>("/api/notifications/read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, ids }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", lower] });
    },
  });

  return {
    items: query.data?.items ?? [],
    unread: query.data?.unread ?? 0,
    isLoading: query.isLoading,
    markRead,
  };
}

/** Fire-and-forget helper to log a deposit / withdrawal notification. */
export async function logWalletNotification(
  getAccessToken: () => Promise<string | null>,
  address: string,
  type: "deposit" | "withdrawal",
  title: string,
  body?: string,
): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await jsonFetch("/api/notifications", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ address, type, title, body }),
    });
  } catch {
    /* non-fatal */
  }
}
