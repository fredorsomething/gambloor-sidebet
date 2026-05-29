import Image from "next/image";

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
      <Image
        src="/logo.svg"
        alt="Sidebet"
        width={fullscreen ? 80 : 56}
        height={fullscreen ? 80 : 56}
        className="h-14 w-14 object-contain sm:h-20 sm:w-20"
        priority
      />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
    </div>
  );
}
