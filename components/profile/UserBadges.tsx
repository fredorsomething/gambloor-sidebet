"use client";

import { BADGE_VISUAL } from "@/lib/profileBadgeMeta";
import type { BadgeKind } from "@/lib/badges";
import { cn } from "@/lib/utils";

export type { BadgeKind };

/** Every account shows "User" by default; richer badges are layered in later. */
export function UserBadges({
  badges = ["User"],
  className,
}: {
  badges?: BadgeKind[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {badges.map((b) => {
        const meta = BADGE_VISUAL[b];
        const Icon = meta.icon;
        return (
          <span
            key={b}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
              meta.className,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
