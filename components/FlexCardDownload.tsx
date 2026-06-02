"use client";

import { Download, ImageIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

export function FlexCardDownload({
  apiPath,
  account,
  filename,
}: {
  /** e.g. `/api/markets/12/flex-card` or `/api/bets/3/flex-card` */
  apiPath: string;
  account: string;
  filename: string;
}) {
  const { push } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const cardUrl = `${apiPath}?address=${encodeURIComponent(account)}`;
  const downloadUrl = `${cardUrl}&download=1`;

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Couldn't generate flex card");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      push({
        title: "Download failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "danger",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="card overflow-hidden border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Your flex card</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={downloading || previewFailed}
          onClick={() => void download()}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Generating…" : "Download PNG"}
        </Button>
      </div>
      <div className="flex justify-center bg-muted/10 p-4">
        {previewFailed ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Couldn&apos;t load preview — try Download PNG.
          </p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cardUrl}
            alt="Your result flex card"
            className="max-h-[420px] w-auto max-w-full rounded-xl border border-border shadow-md"
            onError={() => setPreviewFailed(true)}
          />
        )}
      </div>
      <p className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
        Win or lose — flex it. Share on Twitter, Discord, or save to your camera roll.
      </p>
    </section>
  );
}
