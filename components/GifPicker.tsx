"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/lib/fetcher";

export type GifResult = { id: string; url: string; preview: string };

/**
 * Search Giphy (via /api/gifs) or paste a URL. Shows trending GIFs when the
 * search box is empty.
 */
export function GifPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching, isError, error } = useQuery<{
    configured: boolean;
    gifs: GifResult[];
    error?: string;
  }>({
    queryKey: ["gifs", debounced],
    queryFn: () =>
      jsonFetch(`/api/gifs?q=${encodeURIComponent(debounced.trim())}`),
    staleTime: 60_000,
  });

  const configured = data?.configured ?? true;
  const gifs = data?.gifs ?? [];
  const searching = debounced.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Pick a GIF</h4>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {configured ? (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input pl-9"
                placeholder="Search GIFs…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {searching ? `Results for “${debounced.trim()}”` : "Trending GIFs"}
            </p>
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
              {isFetching && gifs.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                  {searching ? "Searching…" : "Loading…"}
                </div>
              )}
              {isError && (
                <div className="col-span-3 py-6 text-center text-sm text-danger">
                  {(error as Error)?.message || "GIF search failed"}
                </div>
              )}
              {!isFetching && !isError && gifs.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                  {data?.error || "No GIFs found. Try another search."}
                </div>
              )}
              {gifs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPick(g.url)}
                  className="overflow-hidden rounded-lg border border-border hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.preview || g.url}
                    alt=""
                    className="h-24 w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              GIF search isn&apos;t configured. Paste a GIF URL from Giphy or
              Tenor instead.
            </p>
            <input
              className="input"
              placeholder="https://media.giphy.com/…/giphy.gif"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!pasteUrl.trim()}
                onClick={() => onPick(pasteUrl.trim())}
              >
                Attach GIF
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
