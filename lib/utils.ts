import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits, keccak256, parseUnits, toBytes, type Hex } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddr(addr?: string | null, head = 6, tail = 4) {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatToken(amount: bigint, decimals: number, maxFractional = 4) {
  const s = formatUnits(amount, decimals);
  const [whole, frac] = s.split(".");
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, maxFractional).replace(/0+$/, "") || "0"}`;
}

export function parseAmount(input: string, decimals: number): bigint {
  if (!input.trim()) return 0n;
  return parseUnits(input.trim(), decimals);
}

/**
 * Deterministic hash of the off-chain terms blob committed on-chain.
 * Keeping this stable means the metadata server can later prove the
 * displayed text matches what the proposer signed up for.
 */
export function buildTermsHash(args: {
  title: string;
  description: string;
  terms: string;
  proposer: string;
  nonce: string;
}): Hex {
  const blob = JSON.stringify({
    title: args.title.trim(),
    description: args.description.trim(),
    terms: args.terms.trim(),
    proposer: args.proposer.toLowerCase(),
    nonce: args.nonce,
  });
  return keccak256(toBytes(blob));
}

export function formatTimestamp(ts: bigint | number | undefined) {
  if (!ts) return "—";
  const n = typeof ts === "bigint" ? Number(ts) : ts;
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

export function fromNowUnix(ts: bigint | number | undefined): string {
  if (!ts) return "—";
  const n = typeof ts === "bigint" ? Number(ts) : ts;
  if (!n) return "—";
  const diff = n - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
    [1, "s"],
  ];
  for (const [unit, label] of units) {
    if (abs >= unit) {
      const v = Math.floor(abs / unit);
      return diff >= 0 ? `in ${v}${label}` : `${v}${label} ago`;
    }
  }
  return "now";
}
