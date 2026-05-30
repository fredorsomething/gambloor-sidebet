/** Ref-counted body scroll lock so overlays don't leave overflow stuck. */
let lockCount = 0;
let savedOverflow = "";
let savedScrollY = 0;

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (lockCount === 0) {
    savedScrollY = window.scrollY;
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
      // Overlays can leave the page partially scrolled, clipping a sticky header.
      if (window.scrollY !== savedScrollY) {
        window.scrollTo(0, savedScrollY);
      }
    }
  };
}

/** Force-clear any stuck scroll lock (e.g. after hot reload or breakpoint change). */
export function resetBodyScrollLock() {
  lockCount = 0;
  if (typeof document !== "undefined") {
    document.body.style.overflow = savedOverflow || "";
    if (window.scrollY !== savedScrollY) {
      window.scrollTo(0, savedScrollY);
    }
  }
}
