import { cn } from "@/lib/utils";

type Props = {
  imageUrl?: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "h-10 w-14",
  md: "h-16 w-24",
  lg: "h-40 w-full max-w-md",
};

/** Market cover thumbnail for cards, search, and detail headers. */
export function BetThumbnail({ imageUrl, title, size = "md", className }: Props) {
  if (!imageUrl) return null;

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border",
        sizes[size],
        size === "lg" && "aspect-[16/10]",
        className,
      )}
    >
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
