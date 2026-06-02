import { cn } from "@/lib/utils";
import type { IndexedBetStatus } from "@/lib/types";

const STATUS_CLASS: Record<IndexedBetStatus | "Default", string> = {
  None: "badge",
  Open: "badge badge-accent",
  Matched: "badge badge-warning",
  Settled: "badge badge-success",
  Cancelled: "badge",
  Refunded: "badge",
  Expired: "badge",
  Default: "badge",
};

export function StatusBadge({
  status,
  className,
}: {
  status: IndexedBetStatus;
  className?: string;
}) {
  const cls = STATUS_CLASS[status] ?? STATUS_CLASS.Default;
  return <span className={cn(cls, className)}>{status}</span>;
}
