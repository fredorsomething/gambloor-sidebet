"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { MaintenancePacingBirds } from "@/components/maintenance/MaintenancePacingBirds";
import { Button } from "@/components/ui/button";

const PROGRESS_KEY = "sb_maint_progress";

function useMaintenanceProgress() {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(PROGRESS_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n)) {
        setProgress(n);
        return;
      }
    }
    const value = 0.58 + Math.random() * 0.1;
    sessionStorage.setItem(PROGRESS_KEY, String(value));
    setProgress(value);
  }, []);

  return progress;
}

export default function MaintenancePage() {
  const router = useRouter();
  const progress = useMaintenanceProgress();
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

  const pct = progress === null ? 62 : Math.round(progress * 100);

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

        <div className="mt-8 w-full">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-warning transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

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
