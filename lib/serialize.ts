/**
 * BigInt-safe JSON helpers. Prisma SQLite + Next.js return BigInt fields on
 * timestamp/uint64 columns which can't be JSON-serialized by default.
 */
export function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return new Response(JSON.stringify(data, bigintReplacer), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function jsonErr(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
