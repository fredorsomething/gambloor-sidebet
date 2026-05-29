import Link from "next/link";

import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

type Props = {
  /** Wrap in a link to home (navbar). */
  linked?: boolean;
  className?: string;
};

export function BrandLogo({ linked = true, className }: Props) {
  const inner = (
    <ThemedLogo
      className={cn(
        "h-9 max-w-[140px] sm:h-14 sm:max-w-[300px]",
        className,
      )}
      width={300}
      height={56}
      priority
    />
  );

  if (!linked) return <span className="inline-flex shrink-0">{inner}</span>;

  return (
    <Link href="/" className="inline-flex shrink-0 items-center">
      {inner}
    </Link>
  );
}
