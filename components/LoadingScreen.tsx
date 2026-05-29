import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

type Props = {
  fullscreen?: boolean;
  className?: string;
};

export function LoadingScreen({ fullscreen = false, className }: Props) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "flex flex-col items-center justify-center gap-8",
        fullscreen && "fixed inset-0 z-[100] bg-background",
        className,
      )}
    >
      <span
        className={cn(
          "origin-center",
          fullscreen
            ? "scale-[6] sm:scale-[8] md:scale-[10]"
            : "scale-[5] sm:scale-[6]",
        )}
      >
        <ThemedLogo
          className={fullscreen ? "h-20 w-20 sm:h-24 sm:w-24" : "h-16 w-16"}
          priority
        />
      </span>
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
    </div>
  );
}
