"use client";

import { Download, ImageIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

export function MarketFlexCard({
  marketId,
  account,
}: {
  marketId: number;
  account: string;
}) {
  const { push } = useToast();
  const [downloading, setDownloading] = useState(false);

  const previewSrc = `/api/markets/${marketId}/flex-card?address=${encodeURIComponent(account)}`;
  const downloadSrc = `${previewSrc}&download=1`;

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(downloadSrc);
      if (!res.ok) throw new Error("Couldn't generate flex card");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sidebet-market-${marketId}.png`;
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
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Your flex card</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={downloading}
          onClick={() => void download()}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Generating…" : "Download PNG"}
        </Button>
      </div>
      <div className="flex justify-center bg-muted/10 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt="Your market result flex card"
          loading="lazy"
          className="max-h-[420px] w-auto max-w-full rounded-xl border border-border shadow-md"
        />
      </div>
      <p className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
        Share your win (or loss) — includes the market, outcome, and your result.
      </p>
    </section>
  );
}
