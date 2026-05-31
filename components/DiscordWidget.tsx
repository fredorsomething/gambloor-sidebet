"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { jsonFetch } from "@/lib/fetcher";
import type { DiscordWidget as DiscordWidgetData } from "@/lib/discordWidget";
import { cn } from "@/lib/utils";

const FALLBACK_INVITE = "https://discord.com/invite/wr37dnGg";

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 127.14 96.36"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function statusDotClass(status: string): string {
  switch (status) {
    case "online":
      return "bg-success";
    case "idle":
      return "bg-warning";
    case "dnd":
      return "bg-danger";
    default:
      return "bg-muted-foreground/50";
  }
}

function displayMembers(members: DiscordWidgetData["members"]) {
  return members.filter((m) => !/bot|tool/i.test(m.username)).slice(0, 3);
}

export function DiscordWidget({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery<DiscordWidgetData>({
    queryKey: ["discord-widget"],
    queryFn: () => jsonFetch("/api/discord/widget"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const invite = data?.instant_invite || FALLBACK_INVITE;
  const online = data?.presence_count ?? 0;
  const members = data ? displayMembers(data.members) : [];

  const onlineLabel = isLoading
    ? "…"
    : isError
      ? null
      : `${online} online`;

  return (
    <Link
      href={invite}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex w-fit max-w-full shrink-0 items-center gap-2 rounded-lg border border-[#5865F2]/30 bg-card px-2.5 py-1.5 text-xs shadow-sm transition-colors hover:border-[#5865F2]/50 hover:bg-muted/40",
        className,
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#5865F2] text-white">
        <DiscordMark className="h-3.5 w-3.5" />
      </span>
      <span className="whitespace-nowrap font-medium">
        Join our discord!
      </span>
      {onlineLabel && (
        <span className="hidden text-muted-foreground sm:inline">
          · {onlineLabel}
        </span>
      )}
      {members.length > 0 && (
        <span className="hidden items-center -space-x-1 sm:flex">
          {members.map((m) => (
            <span
              key={m.id}
              className="relative inline-block"
              title={m.username}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.avatar_url}
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 rounded-full border border-card bg-muted object-cover"
              />
              <span
                className={cn(
                  "absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full border border-card",
                  statusDotClass(m.status),
                )}
              />
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}
