"use client";

import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { BetThumbnail } from "@/components/BetThumbnail";
import { cn } from "@/lib/utils";
import {
  BET_COVER_MAX_BYTES,
  validateAvatarFileClient,
} from "@/lib/avatarFile";
import { AVATAR_ACCEPT } from "@/lib/profile";

type Props = {
  previewUrl: string | null;
  onPick: (file: File, previewUrl: string) => void;
  onClear: () => void;
  disabled?: boolean;
};

/** Optional cover image when creating a market. */
export function BetImageField({
  previewUrl,
  onPick,
  onClear,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      setLocalError(null);
      if (!file) return;
      const validationError = validateAvatarFileClient(file, BET_COVER_MAX_BYTES);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      onPick(file, URL.createObjectURL(file));
    },
    [onPick],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors sm:flex-row sm:items-center",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {previewUrl ? (
          <BetThumbnail
            imageUrl={previewUrl}
            title="Preview"
            size="lg"
            className="max-h-36 sm:max-w-[200px]"
          />
        ) : (
          <div className="flex h-24 w-full max-w-[200px] items-center justify-center rounded-lg bg-muted text-muted-foreground sm:h-28">
            <ImagePlus className="h-8 w-8" />
          </div>
        )}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-medium">
            Drag and drop a cover image, or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-primary underline-offset-2 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional · JPEG, PNG, WebP, or GIF · max 4 MB · shown on market cards
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        disabled={disabled}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Upload className="h-4 w-4" />
          {previewUrl ? "Change image" : "Add cover image"}
        </button>
        {previewUrl && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>

      {localError && <p className="text-sm text-danger">{localError}</p>}
    </div>
  );
}
