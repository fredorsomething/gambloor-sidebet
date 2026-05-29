import Link from "next/link";

import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

type Props = {
  linked?: boolean;
  className?: string;
};

/** Navbar logo — scaled up because source PNGs are square with padded wordmark. */
export function BrandLogo({ linked = true, className }: Props) {
  const inner = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-visible",
        className,
      )}
    >
      <span className="origin-left scale-[4] sm:scale-[5] md:scale-[6] lg:scale-[7]">
        <ThemedLogo className="h-12 w-12 sm:h-14 sm:w-14" priority />
      </span>
    </span>
  );

  if (!linked) return inner;

  return (
    <Link href="/" className="inline-flex shrink-0 items-center overflow-visible pr-2 sm:pr-4">
      {inner}
    </Link>
  );
}
