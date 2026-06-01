"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Truncated text with a show more/less toggle. Used on feed cards and detail
 * pages so long descriptions or terms do not blow up layout height.
 */
export function CollapsibleBlurb({
  text,
  maxLines = 2,
  className,
}: {
  text: string;
  maxLines?: 2 | 3 | 4;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return null;

  const lineClamp =
    maxLines === 4
      ? "line-clamp-4"
      : maxLines === 3
        ? "line-clamp-3"
        : "line-clamp-2";

  const likelyLong = trimmed.length > 90 || trimmed.includes("\n");

  return (
    <div className={className}>
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          !open && likelyLong && lineClamp,
        )}
      >
        {trimmed}
      </p>
      {likelyLong && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
