"use client";

import { ShieldCheck, Star, Scale, User as UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type BadgeKind = "User" | "Staff" | "Trusted" | "Resolver";

const BADGE_META: Record<
  BadgeKind,
  { label: string; icon: typeof UserIcon; className: string }
> = {
  User: {
    label: "User",
    icon: UserIcon,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
  Staff: {
    label: "Staff",
    icon: ShieldCheck,
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  Trusted: {
    label: "Trusted",
    icon: Star,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  Resolver: {
    label: "Resolver",
    icon: Scale,
    className: "border-success/40 bg-success/10 text-success",
  },
};

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
        const meta = BADGE_META[b];
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
