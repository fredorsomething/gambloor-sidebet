"use client";

import {
  Box,
  HelpCircle,
  LayoutGrid,
  Mail,
  Menu,
  Plus,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { ThemeToggle } from "@/components/ThemeToggle";
import { isAdminAddress } from "@/lib/admin";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Markets", icon: LayoutGrid },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/users", label: "Directory", icon: Users },
];

const ACTIONS = [
  { href: "/create", label: "Create", description: "Sidebet or market", icon: Plus },
  { href: "/me", label: "My positions", description: "Bets you're in", icon: Box },
  { href: "/messages", label: "Messages", description: "Your direct messages", icon: Mail },
  { href: "/how-it-works", label: "How it works", description: "Rules & settlement", icon: HelpCircle },
];

/** Hamburger menu + slide-down drawer for small screens. Hidden on lg+. */
export function MobileNav() {
  const pathname = usePathname();
  const { address } = useAccount();
  const isAdmin = isAdminAddress(address);
  const [open, setOpen] = useState(false);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-xs overflow-y-auto border-r border-border bg-card p-4 shadow-2xl animate-in slide-in-from-left">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold">Menu</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-1">
              {LINKS.map((l) => {
                const active =
                  l.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(l.href);
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {l.label}
                  </Link>
                );
              })}
            </nav>

            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "mt-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-danger/15 text-danger"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <ShieldCheck className="h-5 w-5" />
                Admin
              </Link>
            )}

            <div className="my-4 border-t border-border" />

            <div className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Menu
              </div>
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
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

            <div className="my-4 border-t border-border" />

            <div className="flex items-center justify-between px-3">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
