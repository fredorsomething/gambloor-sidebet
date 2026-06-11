"use client";

import { Camera, ImagePlus, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Avatar } from "@/components/profile/Identity";
import { cn } from "@/lib/utils";
import { validateAvatarFileClient } from "@/lib/avatarFile";
import { AVATAR_ACCEPT } from "@/lib/profile";

type Props = {
  address: string;
  /** Current saved URL from server */
  savedUrl: string | null;
  /** Object URL or blob URL for a newly picked file */
  previewUrl: string | null;
  onPick: (file: File, previewUrl: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Minimal avatar-only picker for onboarding setup */
  variant?: "default" | "compact";
};

export function AvatarUploadZone({
  address,
  savedUrl,
  previewUrl,
  onPick,
  onClear,
  disabled,
  variant = "default",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayUrl = previewUrl ?? savedUrl;

  const handleFile = useCallback(
    (file: File | undefined) => {
      setLocalError(null);
      if (!file) return;
      const validationError = validateAvatarFileClient(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      const url = URL.createObjectURL(file);
      onPick(file, url);
    },
    [onPick],
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative shrink-0">
          <Avatar
            address={address}
            url={displayUrl}
            size={96}
            className="ring-2 ring-border/80"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            aria-label="Change photo"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            {displayUrl ? "Change photo" : "Add photo"}
          </button>
          {displayUrl && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                disabled={disabled}
                onClick={onClear}
                className="transition-colors hover:text-danger"
              >
                Remove
              </button>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={onInputChange}
          disabled={disabled}
        />
        {localError && <p className="text-xs text-danger">{localError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <Avatar
            address={address}
            url={displayUrl}
            size={112}
            className="ring-4 ring-border"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md transition-colors hover:bg-muted disabled:opacity-50"
            aria-label="Change photo"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drag and drop a photo, or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-primary underline-offset-2 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP, or GIF · max 2 MB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={onInputChange}
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
          Upload photo
        </button>
        {(previewUrl || savedUrl) && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Remove photo
          </button>
        )}
      </div>

      {localError && (
        <p className="text-sm text-danger">{localError}</p>
      )}
    </div>
  );
}
