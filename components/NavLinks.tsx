"use client";

import { Box, ChevronDown, Gift, HelpCircle, Mail, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { isAdminAddress } from "@/lib/admin";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/home", label: "Markets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/users", label: "Directory" },
];

const ACTIONS = [
  {
    href: "/create",
    label: "Create bet",
    description: "Sidebet or market",
    icon: Plus,
  },
  {
    href: "/me",
    label: "View Positions",
    description: "Bets you're in",
    icon: Box,
  },
  {
    href: "/messages",
    label: "Messages",
    description: "Your direct messages",
    icon: Mail,
  },
  {
    href: "/how-it-works",
    label: "How it works",
    description: "Rules & settlement",
    icon: HelpCircle,
  },
  {
    href: "/referrals",
    label: "Referrals",
    description: "Earn 35% of proceeds",
    icon: Gift,
  },
];

export function NavLinks() {
  const pathname = usePathname();
  const { address } = useAccount();
  const isAdmin = isAdminAddress(address);
  const [actionsOpen, setActionsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const actionsActive = ACTIONS.some((a) => pathname.startsWith(a.href));

  return (
    <nav className="hidden items-center gap-1 text-sm lg:flex">
      {LINKS.map((l) => {
        const active =
          l.href === "/home"
            ? pathname === "/home" || pathname === "/"
            : pathname.startsWith(l.href);
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

      {isAdmin && (
        <Link
          href="/admin"
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition-colors",
            pathname.startsWith("/admin")
              ? "bg-danger/15 text-danger"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Admin
        </Link>
      )}

      <div className="relative" ref={ref}>
        <button
          onClick={() => setActionsOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition-colors",
            actionsActive || actionsOpen
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Menu
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              actionsOpen && "rotate-180",
            )}
          />
        </button>

        {actionsOpen && (
          <div className="absolute right-0 top-full z-[120] mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl animate-in fade-in slide-in-from-top-1">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              const active = pathname.startsWith(a.href);
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={() => setActionsOpen(false)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-3 py-2 transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {a.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {a.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
