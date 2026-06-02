"use client";

import { useEffect, type RefObject } from "react";

/** Attribute on portaled {@link MobileBottomSheet} roots — excluded from outside-click dismiss. */
export const MOBILE_SHEET_ROOT_ATTR = "data-mobile-sheet-root";

/**
 * Closes popovers on outside mousedown. Ignores clicks inside portaled mobile
 * bottom sheets (they render outside the trigger ref).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      const target = e.target as Element;
      if (target.closest(`[${MOBILE_SHEET_ROOT_ATTR}]`)) return;
      onOutside();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, onOutside, enabled]);
}
