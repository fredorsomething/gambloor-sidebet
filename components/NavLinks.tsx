"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/bets/new", label: "New bet" },
  { href: "/me", label: "My bets" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm lg:flex">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
