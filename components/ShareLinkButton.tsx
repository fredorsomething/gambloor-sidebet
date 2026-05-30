"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  path: string;
  title?: string;
  className?: string;
};

/** Copy or native-share the canonical page URL. */
export function ShareLinkButton({ path, title, className }: Props) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: title ?? document.title });
        return;
      }
    } catch {
      // User dismissed the share sheet — fall through to copy.
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ title: "Link copied" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push({ title: "Couldn't copy link", variant: "danger" });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onShare}
      className={className ?? "h-8 w-8 p-0 text-muted-foreground hover:text-foreground"}
      aria-label="Share link"
      title="Share link"
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
    </Button>
  );
}
