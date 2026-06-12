"use client";

import { useEffect, useRef } from "react";

/**
 * Persist a JSON-serialisable snapshot of in-progress form state to
 * localStorage so reloads, discarded mobile tabs, and other interruptions
 * don't lose the user's work.
 *
 * - Restores once on mount via `restore(saved)`.
 * - Saves the snapshot (debounced) whenever it changes.
 * - Call `clear()` after a successful submit.
 *
 * Pass a memoised `snapshot` (e.g. built with `useMemo`) so saves only fire
 * when the underlying fields actually change.
 */
export function useFormDraft<T>(
  key: string,
  snapshot: T,
  restore: (saved: T) => void,
): { clear: () => void } {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) restoreRef.current(JSON.parse(raw) as T);
    } catch {
      // Corrupt or inaccessible draft — start fresh.
    }
  }, [key]);

  useEffect(() => {
    if (!restored.current) return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // Storage full or unavailable — drafts are best-effort.
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [key, snapshot]);

  const clearRef = useRef(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  });

  return { clear: clearRef.current };
}
