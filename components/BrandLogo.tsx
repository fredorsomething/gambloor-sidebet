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
      className={cn("h-8 max-w-[160px] sm:h-9 sm:max-w-[180px]", className)}
      width={180}
      height={36}
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
