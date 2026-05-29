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
        "h-14 w-auto max-w-[min(52vw,280px)] sm:h-[4.5rem] sm:max-w-[360px] md:h-20 md:max-w-[440px] lg:h-24 lg:max-w-[520px]",
        className,
      )}
      width={520}
      height={130}
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
