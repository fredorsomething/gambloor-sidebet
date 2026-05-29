import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Blue check shown after verified usernames (staff, trusted traders, etc.). */
export function VerifiedBadge({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/verified.png"
      alt="Verified"
      width={size}
      height={size}
      title="Verified"
      className={cn("inline-block shrink-0 align-middle", className)}
    />
  );
}

/** Inline name + optional verified check (for lists that already have the label). */
export function UserNameWithBadge({
  name,
  verified,
  className,
}: {
  name: ReactNode;
  verified?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-0.5",
        className,
      )}
    >
      <span className="truncate">{name}</span>
      {verified ? <VerifiedBadge /> : null}
    </span>
  );
}
