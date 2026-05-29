import { cn } from "@/lib/utils";

type Props = {
  imageUrl?: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, render a generated gradient tile (with initials) if no image. */
  fallback?: boolean;
};

/** Square thumbnails for cards, lists, and detail headers. */
const sizes = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-44 w-44 sm:h-52 sm:w-52",
};

function gradientFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % 360;
  }
  const a = hash;
  const b = (hash + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 52%), hsl(${b} 75% 42%))`;
}

export function BetThumbnail({
  imageUrl,
  title,
  size = "md",
  className,
  fallback = false,
}: Props) {
  if (!imageUrl && !fallback) return null;

  const wrapperClass = cn(
    "aspect-square shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border",
    sizes[size],
    className,
  );

  if (!imageUrl) {
    const initials = title.trim().slice(0, 2).toUpperCase() || "?";
    return (
      <div
        className={wrapperClass}
        style={{ backgroundImage: gradientFor(title) }}
      >
        <div className="flex h-full w-full items-center justify-center font-bold text-white/90">
          <span className={size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-sm"}>
            {initials}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="h-full w-full object-cover"
        title={title}
      />
    </div>
  );
}
