import Image from "next/image";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/**
 * Sidebet wordmark — white on dark, black on light.
 * Assets are square PNGs; size via className (height + width) on the wrapper.
 */
export function ThemedLogo({
  className,
  width = 1254,
  height = 1254,
  priority = false,
}: Props) {
  const imgClass = cn("block object-contain object-left", className);

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
