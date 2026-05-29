import { cn } from "@/lib/utils";

type Props = {
  imageUrl?: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, render a generated gradient tile (with initials) if no image. */
  fallback?: boolean;
};

const sizes = {
  sm: "h-10 w-14",
  md: "h-16 w-24",
  lg: "h-40 w-full max-w-md",
};

/** Deterministic gradient from the title so empty covers still look intentional. */
function gradientFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % 360;
  }
  const a = hash;
  const b = (hash + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 52%), hsl(${b} 75% 42%))`;
}

/** Market cover thumbnail for cards, search, and detail headers. */
export function BetThumbnail({
  imageUrl,
  title,
  size = "md",
  className,
  fallback = false,
}: Props) {
  if (!imageUrl && !fallback) return null;

  const wrapperClass = cn(
    "shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border",
    sizes[size],
    size === "lg" && "aspect-[16/10]",
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
          <span className={size === "lg" ? "text-4xl" : "text-lg"}>
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
