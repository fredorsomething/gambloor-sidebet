"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { MaintenancePacingBirds } from "@/components/maintenance/MaintenancePacingBirds";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const COUNTDOWN_KEY = "sb_maint_eta";

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useMaintenanceCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let targetMs = Number(sessionStorage.getItem(COUNTDOWN_KEY));
    if (!Number.isFinite(targetMs)) {
      targetMs = Date.now() + TWELVE_HOURS_MS;
      sessionStorage.setItem(COUNTDOWN_KEY, String(targetMs));
    }

    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return remaining;
}

export default function MaintenancePage() {
  const router = useRouter();
  const countdown = useMaintenanceCountdown();
  const [showUnlock, setShowUnlock] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showUnlock) inputRef.current?.focus();
  }, [showUnlock]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Incorrect password");
      }
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Incorrect password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 40%, hsl(var(--primary) / 0.12), transparent 70%)",
        }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <BrandLogo className="mb-8 scale-110" />

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Under maintenance
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Sidebet is getting a quick tune-up. Hang tight — the birds are on it.
        </p>

        <div className="mt-8 w-full">
          <MaintenancePacingBirds />
        </div>

        <div className="mt-6 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
            Estimated return
          </p>
          <p
            className="font-mono text-3xl font-medium tabular-nums tracking-tight text-foreground sm:text-4xl"
            aria-live="polite"
          >
            {countdown === null ? "—:——:——" : formatCountdown(countdown)}
          </p>
        </div>
      </div>

      {/* Discrete staff unlock — faint corner control, expands on click */}
      <div className="fixed bottom-5 right-5 z-10">
        {!showUnlock ? (
          <button
            type="button"
            onClick={() => setShowUnlock(true)}
            className="h-8 w-8 rounded-full opacity-[0.06] transition-opacity hover:opacity-25 focus-visible:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
            aria-label="Staff access"
            title=""
          >
            <span className="sr-only">Staff access</span>
          </button>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 rounded-full border border-border/40 bg-card/60 px-3 py-1.5 shadow-sm backdrop-blur-sm"
          >
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="· · ·"
              autoComplete="off"
              disabled={submitting}
              className="w-20 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none sm:w-24"
            />
            <button
              type="submit"
              disabled={submitting || !password}
              className="text-[10px] uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-40"
            >
              {submitting ? "…" : "ok"}
            </button>
          </form>
        )}
        {error && showUnlock && (
          <p className="mt-1 text-right text-[10px] text-danger/80">{error}</p>
        )}
      </div>
    </div>
  );
}
