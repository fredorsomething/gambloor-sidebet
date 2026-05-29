import { cn } from "@/lib/utils";
import type { BetStatusName } from "@/lib/abi";

const STATUS_CLASS: Record<BetStatusName | "Default", string> = {
  None: "badge",
  Open: "badge badge-accent",
  Matched: "badge badge-warning",
  Settled: "badge badge-success",
  Cancelled: "badge",
  Refunded: "badge",
  Default: "badge",
};

export function StatusBadge({
  status,
  className,
}: {
  status: BetStatusName;
  className?: string;
}) {
  const cls = STATUS_CLASS[status] ?? STATUS_CLASS.Default;
  return <span className={cn(cls, className)}>{status}</span>;
}
