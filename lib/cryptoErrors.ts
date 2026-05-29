/**
 * Turn viem / Privy / RPC errors into short, user-facing copy for toasts.
 */

export type CryptoErrorDisplay = {
  title: string;
  description?: string;
};

function extractRawMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const parts: string[] = [];
    const short = (err as Error & { shortMessage?: string }).shortMessage;
    if (short) parts.push(short);
    if (err.message) parts.push(err.message);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) parts.push(extractRawMessage(cause));
    return parts.join(" ");
  }
  if (typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Strip JSON-RPC noise (URLs, request bodies, viem version tags). */
function sanitizeRpcMessage(msg: string): string {
  let s = msg.trim();
  const details = s.match(
    /Details:\s*([\s\S]+?)(?:\s+Version:\s*viem|$)/i,
  )?.[1];
  if (details && details.length < 280 && !details.trimStart().startsWith("{")) {
    s = details.trim();
  }
  s = s.replace(/URL:\s*https?:\/\/\S+/gi, "");
  s = s.replace(/Request body:\s*\{[\s\S]*$/gi, "");
  s = s.replace(/Version:\s*viem@[\d.]+/gi, "");
  s = s.replace(
    /Missing or invalid parameters\.\s*Double check[^\n]*/gi,
    "",
  );
  return s.replace(/\s{2,}/g, " ").trim();
}

const RULES: Array<{
  test: RegExp;
  title: string;
  description: string;
}> = [
  {
    test: /user rejected|user denied|rejected the request|action_rejected|4001|denied transaction|cancelled/i,
    title: "Transaction cancelled",
    description: "You declined the transaction in your wallet.",
  },
  {
    test: /insufficient funds for gas|overshot|tx cost.*balance/i,
    title: "Not enough for gas",
    description:
      "Keep some POL in your wallet for network fees, or use a smaller amount.",
  },
  {
    test: /insufficient funds|exceeds balance|transfer amount exceeds|insufficient balance/i,
    title: "Insufficient balance",
    description: "You don't have enough of this token for that amount.",
  },
  {
    test: /gas required exceeds|intrinsic gas too low/i,
    title: "Transaction too large",
    description: "Try a smaller amount or try again in a moment.",
  },
  {
    test: /execution reverted|reverted|revert/i,
    title: "Transaction failed on-chain",
    description:
      "The contract rejected this. You may need to approve the token first or change the amount.",
  },
  {
    test: /allowance|erc20: insufficient allowance|approve/i,
    title: "Approval needed",
    description: "Approve the token in your wallet, then try again.",
  },
  {
    test: /unsupported method|wallet_sendTransaction|eth_sendRawTransaction/i,
    title: "Wallet connection issue",
    description: "Refresh the page and sign in again.",
  },
  {
    test: /liquidity|not enough liquidity/i,
    title: "Not enough liquidity",
    description: "Try a smaller trade or a different token pair.",
  },
  {
    test: /slippage|price impact/i,
    title: "Price moved too much",
    description: "Try again or use a smaller amount.",
  },
  {
    test: /nonce too low|replacement transaction/i,
    title: "Pending transaction",
    description: "Wait for your last transaction to finish, then try again.",
  },
  {
    test: /wrong chain|chain mismatch|switch.*polygon|unsupported chain|chainid/i,
    title: "Wrong network",
    description: "Switch your wallet to Polygon and try again.",
  },
  {
    test: /timeout|timed out/i,
    title: "Request timed out",
    description: "Check your connection and try again.",
  },
  {
    test: /rate limit|too many requests|429/i,
    title: "Too many requests",
    description: "Wait a few seconds and try again.",
  },
  {
    test: /could not fetch quote|could not fetch price|swap quote failed/i,
    title: "Couldn't get a quote",
    description: "Try a different amount or pair.",
  },
  {
    test: /approval did not confirm/i,
    title: "Approval still pending",
    description: "Wait for the approval to confirm, then try your swap again.",
  },
];

/**
 * Map an on-chain / wallet error to a friendly title + optional description.
 */
export function formatCryptoError(
  err: unknown,
  options?: { fallbackTitle?: string },
): CryptoErrorDisplay {
  const raw = sanitizeRpcMessage(extractRawMessage(err));
  const haystack = raw.toLowerCase();

  for (const rule of RULES) {
    if (rule.test.test(haystack) || rule.test.test(raw)) {
      return { title: rule.title, description: rule.description };
    }
  }

  const fallback = options?.fallbackTitle ?? "Something went wrong";
  if (!raw) {
    return {
      title: fallback,
      description: "Please try again.",
    };
  }

  // Last resort: show a trimmed snippet, never the full RPC dump.
  const snippet =
    raw.length > 100 ? `${raw.slice(0, 97).trim()}…` : raw;
  return {
    title: fallback,
    description: snippet,
  };
}

/** One line for inline form error text. */
export function cryptoErrorSummary(
  err: unknown,
  fallbackTitle: string,
): string {
  const { title, description } = formatCryptoError(err, { fallbackTitle });
  return description ? `${title} — ${description}` : title;
}
