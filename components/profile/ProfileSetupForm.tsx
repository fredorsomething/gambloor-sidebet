"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { AvatarUploadZone } from "@/components/profile/AvatarUploadZone";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import { useProfile } from "@/lib/hooks/useProfile";
import { validateBio, validateSocial, validateUsername } from "@/lib/profile";
import { cn } from "@/lib/utils";

export function ProfileSetupForm() {
  const router = useRouter();
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();
  const { data: savedProfile, isLoading } = useProfile(address);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [discord, setDiscord] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!savedProfile || hydrated || isLoading) return;
    setUsername(savedProfile.username ?? "");
    setBio(savedProfile.bio ?? "");
    setTwitter(savedProfile.twitter ?? "");
    setDiscord(savedProfile.discord ?? "");
    if (savedProfile.bio || savedProfile.twitter || savedProfile.discord) {
      setShowExtras(true);
    }
    setHydrated(true);
  }, [savedProfile, hydrated, isLoading]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPick = useCallback(
    (file: File, url: string) => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setAvatarFile(file);
      setPreviewUrl(url);
    },
    [previewUrl],
  );

  const onClearAvatar = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setAvatarFile(null);
    setPreviewUrl(null);
  }, [previewUrl]);

  const usernameError = validateUsername(username, { required: true });
  const bioError = validateBio(bio);
  const twitterError = validateSocial(twitter, "X");
  const discordError = validateSocial(discord, "Discord");
  const canSave =
    !!username.trim() &&
    !usernameError &&
    !bioError &&
    !twitterError &&
    !discordError &&
    !saving &&
    !!address;

  async function onSave() {
    if (!address || !canSave) return;
    setError(null);
    setSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const authHeader = { Authorization: `Bearer ${token}` };

      let avatarUrl: string | null = savedProfile?.avatarUrl ?? null;

      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        fd.append("address", address);

        const uploadRes = await fetch("/api/upload/avatar", {
          method: "POST",
          headers: authHeader,
          body: fd,
        });
        if (!uploadRes.ok) {
          let msg = "Avatar upload failed";
          try {
            const body = await uploadRes.json();
            if (body?.error) msg = body.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const { url } = (await uploadRes.json()) as { url: string };
        avatarUrl = url;
      }

      await jsonFetch(`/api/users/${address}`, {
        method: "PUT",
        headers: authHeader,
        body: JSON.stringify({
          username: username.trim(),
          avatarUrl,
          bio: bio.trim() || null,
          twitter: twitter.trim() || null,
          discord: discord.trim() || null,
        }),
      });

      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["userPage"] });

      push({ title: "Profile saved", variant: "success" });
      router.replace("/home");
    } catch (err) {
      setError((err as Error)?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !address) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="mx-auto h-24 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-11 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-12 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col">
      <h1 className="text-center text-2xl font-semibold tracking-tight">
        Create your profile
      </h1>

      <div className="mt-8 space-y-6">
        <AvatarUploadZone
          address={address}
          savedUrl={savedProfile?.avatarUrl ?? null}
          previewUrl={previewUrl}
          onPick={onPick}
          onClear={onClearAvatar}
          disabled={saving}
          variant="compact"
        />

        <div>
          <label className="sr-only" htmlFor="setup-username">
            Username
          </label>
          <div
            className={cn(
              "flex items-center overflow-hidden rounded-xl border bg-card transition-colors focus-within:ring-2 focus-within:ring-primary/30",
              usernameError ? "border-danger" : "border-border",
            )}
          >
            <span className="pl-4 text-sm text-muted-foreground">@</span>
            <input
              id="setup-username"
              className="input min-w-0 flex-1 border-0 bg-transparent px-2 py-3 shadow-none focus:ring-0"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              maxLength={20}
              autoComplete="off"
              autoFocus
              disabled={saving}
            />
          </div>
          {usernameError && (
            <p className="mt-2 text-xs text-danger">{usernameError}</p>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Bio & socials</span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground/70">optional</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  showExtras && "rotate-180",
                )}
              />
            </span>
          </button>

          {showExtras && (
            <div className="mt-3 space-y-3 border-t border-border/60 pt-4">
              <input
                id="setup-bio"
                className={cn("input", bioError && "border-danger")}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Bio"
                maxLength={280}
                disabled={saving}
              />
              <input
                id="setup-twitter"
                className={cn("input", twitterError && "border-danger")}
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="X / Twitter"
                maxLength={100}
                autoComplete="off"
                disabled={saving}
              />
              <input
                id="setup-discord"
                className={cn("input", discordError && "border-danger")}
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="Discord"
                maxLength={100}
                autoComplete="off"
                disabled={saving}
              />
              {(bioError || twitterError || discordError) && (
                <p className="text-xs text-danger">
                  {bioError ?? twitterError ?? discordError}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-center text-sm text-danger">{error}</p>
        )}

        <Button
          className="w-full rounded-xl"
          size="lg"
          onClick={onSave}
          disabled={!canSave}
        >
          {saving ? "Saving…" : "Continue"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted-foreground/80">
          You can change your username and profile anytime in settings.
        </p>
      </div>
    </div>
  );
}
