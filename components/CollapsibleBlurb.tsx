"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Truncated text with a show more/less toggle. Used on feed cards and detail
 * pages so long descriptions or terms do not blow up layout height.
 */
function blurbTextMinHeight(maxLines: 2 | 3 | 4) {
  if (maxLines === 4) return "min-h-[5rem]";
  if (maxLines === 3) return "min-h-[3.75rem]";
  return "min-h-[2.5rem]";
}

export function CollapsibleBlurb({
  text,
  maxLines = 2,
  className,
  /** Keep a fixed-height slot for the toggle so feed cards align in a grid. */
  reserveToggle = false,
}: {
  text: string;
  maxLines?: 2 | 3 | 4;
  className?: string;
  reserveToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trimmed = text?.trim() ?? "";
  const textMinH = blurbTextMinHeight(maxLines);

  if (!trimmed) {
    if (!reserveToggle) return null;
    return (
      <div className={cn(className, "mt-1")} aria-hidden>
        <div className={textMinH} />
        <div className="mt-1 h-5" />
      </div>
    );
  }

  const lineClamp =
    maxLines === 4
      ? "line-clamp-4"
      : maxLines === 3
        ? "line-clamp-3"
        : "line-clamp-2";

  const likelyLong = trimmed.length > 90 || trimmed.includes("\n");

  const toggle = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      className="text-xs font-medium text-primary hover:underline"
      tabIndex={likelyLong ? 0 : -1}
      aria-hidden={!likelyLong}
    >
      {open ? "Show less" : "Show more"}
    </button>
  );

  return (
    <div className={className}>
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          reserveToggle && textMinH,
          !open && likelyLong && lineClamp,
        )}
      >
        {trimmed}
      </p>
      {reserveToggle ? (
        <div
          className={cn(
            "mt-1 h-5",
            !likelyLong && "pointer-events-none invisible",
          )}
        >
          {toggle}
        </div>
      ) : (
        likelyLong && <div className="mt-1">{toggle}</div>
      )}
    </div>
  );
}
