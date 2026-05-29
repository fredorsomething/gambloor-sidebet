import { getAddress } from "viem";

import { prisma } from "@/lib/db";

export type ApprovedSettlerInfo = {
  address: string;
  username: string | null;
  feeBps: number;
};

/** Approved settlers joined with their profile username (for the dropdown). */
export async function listApprovedSettlers(): Promise<ApprovedSettlerInfo[]> {
  const settlers = await prisma.approvedSettler.findMany({
    where: { approved: true },
    orderBy: { createdAt: "asc" },
  });

  if (settlers.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { address: { in: settlers.map((s) => s.address) } },
    select: { address: true, username: true },
  });
  const usernameByAddr = new Map(
    users.map((u) => [u.address.toLowerCase(), u.username]),
  );

  return settlers.map((s) => ({
    address: s.address,
    username: s.username ?? usernameByAddr.get(s.address.toLowerCase()) ?? null,
    feeBps: s.feeBps,
  }));
}

/** Returns the approved settler record (or null) for an address. */
export async function getApprovedSettler(address: string) {
  let addr: string;
  try {
    addr = getAddress(address);
  } catch {
    return null;
  }
  const s = await prisma.approvedSettler.findUnique({ where: { address: addr } });
  return s && s.approved ? s : null;
}
