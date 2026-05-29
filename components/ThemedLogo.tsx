import Image from "next/image";

import { cn } from "@/lib/utils";

type Props = {
  /** Tailwind height class, e.g. h-8. Width follows aspect ratio. */
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/**
 * Sidebet wordmark — white on dark backgrounds, black on light.
 * Relies on `dark` on <html> (default) matching ThemeToggle / boot script.
 */
export function ThemedLogo({
  className,
  width = 160,
  height = 40,
  priority = false,
}: Props) {
  const imgClass = cn("h-auto w-auto max-w-full object-contain object-left", className);

  return (
    <>
      <Image
        src="/sidebet_white.png"
        alt="Sidebet"
        width={width}
        height={height}
        className={cn(imgClass, "hidden dark:block")}
        priority={priority}
      />
      <Image
        src="/sidebet.png"
        alt="Sidebet"
        width={width}
        height={height}
        className={cn(imgClass, "block dark:hidden")}
        priority={priority}
      />
    </>
  );
}
