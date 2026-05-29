import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

type Props = {
  /** Cover the viewport (initial app / Privy boot). */
  fullscreen?: boolean;
  className?: string;
};

export function LoadingScreen({ fullscreen = false, className }: Props) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "flex flex-col items-center justify-center gap-5",
        fullscreen && "fixed inset-0 z-[100] bg-background",
        className,
      )}
    >
      <ThemedLogo
        className={cn(
          "w-auto max-w-[min(90vw,520px)]",
          fullscreen ? "h-24 sm:h-32 md:h-40" : "h-20 sm:h-24",
        )}
        width={640}
        height={160}
        priority
      />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
    </div>
  );
}
