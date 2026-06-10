import {
  Crown,
  Heart,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Star,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";

import type { BadgeKind } from "@/lib/badges";

export type BadgeVisual = {
  label: string;
  icon: LucideIcon;
  className: string;
  /** Muted preview styling for locked catalog entries. */
  lockedClassName: string;
};

export const BADGE_VISUAL: Record<BadgeKind, BadgeVisual> = {
  User: {
    label: "User",
    icon: UserIcon,
    className: "border-border bg-muted/40 text-muted-foreground",
    lockedClassName: "border-border/60 bg-muted/20 text-muted-foreground/50",
  },
  Admin: {
    label: "Admin",
    icon: ShieldAlert,
    className: "border-danger/50 bg-danger/15 text-danger",
    lockedClassName: "border-border/60 bg-muted/20 text-muted-foreground/50",
  },
  Staff: {
    label: "Staff",
    icon: ShieldCheck,
    className: "border-primary/40 bg-primary/10 text-primary",
    lockedClassName: "border-border/60 bg-muted/20 text-muted-foreground/50",
  },
  Trusted: {
    label: "Trusted",
    icon: Star,
    className: "border-warning/40 bg-warning/10 text-warning",
    lockedClassName: "border-border/60 bg-muted/20 text-muted-foreground/50",
  },
  Resolver: {
    label: "Resolver",
    icon: Scale,
    className: "border-success/40 bg-success/10 text-success",
    lockedClassName: "border-border/60 bg-muted/20 text-muted-foreground/50",
  },
  OG: {
    label: "OG",
    icon: Crown,
    className: "border-purple-500/50 bg-purple-500/15 text-purple-400",
    lockedClassName: "border-purple-500/30 bg-purple-500/10 text-purple-400/70",
  },
  Supporter: {
    label: "Supporter",
    icon: Heart,
    className: "border-pink-500/50 bg-pink-500/15 text-pink-400",
    lockedClassName: "border-pink-500/30 bg-pink-500/10 text-pink-400/70",
  },
};

/** Badges shown greyed out in the cosmetics catalog (not bought here). */
export const LOCKED_CATALOG_BADGES: BadgeKind[] = [
  "User",
  "OG",
  "Staff",
  "Trusted",
  "Resolver",
  "Admin",
];

export const LOCKED_CATALOG_HINT: Partial<Record<BadgeKind, string>> = {
  User: "Everyone starts with this badge.",
  OG: "Granted to early Sidebet users.",
  Staff: "Granted by the platform team.",
  Trusted: "Granted to verified traders.",
  Resolver: "Granted to approved settlers.",
  Admin: "Platform administrators only.",
};
