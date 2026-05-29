import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Props = {
  /** Wrap in a link to home (navbar). */
  linked?: boolean;
  className?: string;
};

/** Site mark: icon + wordmark from /public. */
export function BrandLogo({ linked = true, className }: Props) {
  const inner = (
    <span className={cn("flex shrink-0 items-center gap-2.5", className)}>
      <Image
        src="/logo.svg"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 object-contain"
        priority
      />
      <Image
        src="/sidebet.lol"
        alt="Sidebet"
        width={140}
        height={36}
        className="hidden h-7 w-auto max-w-[140px] object-contain object-left sm:block"
        priority
      />
    </span>
  );

  if (!linked) return inner;

  return (
    <Link href="/" className="flex shrink-0 items-center">
      {inner}
    </Link>
  );
}
