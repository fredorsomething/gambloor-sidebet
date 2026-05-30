"use client";

import Link from "next/link";
import { useMemo } from "react";

import { LinkPreviewCard } from "@/components/chat/LinkPreviewCard";
import {
  extractUrls,
  normalizePreviewUrl,
  parseInternalLink,
  splitMessageWithUrls,
} from "@/lib/linkPreview";

export function MessageText({
  body,
  className,
  linkClassName,
}: {
  body: string;
  className?: string;
  linkClassName?: string;
}) {
  const parts = useMemo(() => splitMessageWithUrls(body), [body]);
  if (!body.trim()) return null;

  return (
    <p
      className={
        className ??
        "mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90"
      }
    >
      {parts.map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <MessageLink key={i} href={part.value} className={linkClassName} />
        ),
      )}
    </p>
  );
}

export function MessagePreviews({ body }: { body: string }) {
  const previewUrls = useMemo(() => {
    const urls = extractUrls(body)
      .map(normalizePreviewUrl)
      .filter((u) => parseInternalLink(u));
    return [...new Set(urls)].slice(0, 3);
  }, [body]);

  if (!previewUrls.length) return null;

  return (
    <>
      {previewUrls.map((url) => (
        <LinkPreviewCard key={url} url={url} />
      ))}
    </>
  );
}

export function RichMessageBody({ body }: { body: string }) {
  if (!body.trim()) return null;
  return (
    <>
      <MessageText body={body} />
      <MessagePreviews body={body} />
    </>
  );
}

function MessageLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const internal = parseInternalLink(href);
  const display = href.length > 48 ? href.slice(0, 45) + "…" : href;
  const linkClass =
    className ??
    "break-all text-primary underline-offset-2 hover:underline";

  if (internal) {
    let path = href.split(/[?#]/)[0]!;
    if (!path.startsWith("/")) {
      try {
        path = new URL(path).pathname;
      } catch {
        path = href;
      }
    }
    return (
      <Link href={path} className={linkClass}>
        {display}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {display}
    </a>
  );
}
