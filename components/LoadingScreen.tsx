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
          fullscreen
            ? "h-24 max-w-[320px] sm:h-32 sm:max-w-[400px]"
            : "h-16 max-w-[280px] sm:h-20 sm:max-w-[340px]",
        )}
        width={400}
        height={80}
        priority
      />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
    </div>
  );
}
