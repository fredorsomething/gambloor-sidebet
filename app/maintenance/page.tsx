"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { MaintenancePacingBirds } from "@/components/maintenance/MaintenancePacingBirds";
import { Button } from "@/components/ui/button";

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
    if (!Number.isFinite(targetMs) || targetMs <= Date.now()) {
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
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <BrandLogo className="mb-6" linked={false} />

        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Under maintenance
        </h1>

        <div className="mt-6 w-full">
          <MaintenancePacingBirds />
        </div>

        <p className="mt-6 font-mono text-2xl tabular-nums text-muted-foreground sm:text-3xl">
          {countdown === null ? "—:——:——" : formatCountdown(countdown)}
        </p>

        <form onSubmit={onSubmit} className="mt-8 w-full space-y-3">
          <input
            type="password"
            className="input w-full"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={submitting}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !password.trim()}
          >
            {submitting ? "Checking…" : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
