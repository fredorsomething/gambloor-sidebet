"use client";

import Link from "next/link";

import { useProfile } from "@/lib/hooks/useProfile";
import { avatarDataUri } from "@/lib/avatar";
import { cn, shortAddr } from "@/lib/utils";

export function Avatar({
  address,
  url,
  size = 32,
  className,
}: {
  address: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const src = url || avatarDataUri(address, size * 2);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("rounded-full object-cover bg-muted ring-1 ring-border", className)}
    />
  );
}

/** Resolves + renders an address as username (or short address) with avatar. */
export function Identity({
  address,
  size = 24,
  showAvatar = true,
  link = true,
  className,
  weight = "normal",
}: {
  address: string;
  size?: number;
  showAvatar?: boolean;
  link?: boolean;
  className?: string;
  weight?: "normal" | "medium" | "semibold";
}) {
  const { data } = useProfile(address);
  const label = data?.username || shortAddr(address);

  const inner = (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showAvatar && (
        <Avatar address={address} url={data?.avatarUrl} size={size} />
      )}
      <span
        className={cn(
          "truncate",
          weight === "medium" && "font-medium",
          weight === "semibold" && "font-semibold",
        )}
      >
        {label}
      </span>
    </span>
  );

  if (!link) return inner;
  return (
    <Link
      href={`/u/${data?.username ?? address}`}
      className="hover:text-primary transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </Link>
  );
}
