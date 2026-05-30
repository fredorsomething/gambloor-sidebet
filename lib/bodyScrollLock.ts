/** Ref-counted body scroll lock so overlays don't leave overflow stuck. */
let lockCount = 0;
let savedOverflow = "";

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
    }
  };
}

/** Force-clear any stuck scroll lock (e.g. after hot reload). */
export function resetBodyScrollLock() {
  lockCount = 0;
  if (typeof document !== "undefined") {
    document.body.style.overflow = savedOverflow || "";
  }
}
