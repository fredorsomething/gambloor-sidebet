"use client";

import { Check, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  path: string;
  className?: string;
};

/** Copy the page URL and prompt the user to share it. */
export function ShareLinkButton({ path, className }: Props) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ title: "Link copied. Share your sidebet!" });
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
      aria-label="Copy link to share"
      title="Copy link to share"
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Upload className="h-4 w-4" />}
    </Button>
  );
}
