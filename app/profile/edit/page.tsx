"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { WalletGuard } from "@/components/WalletGuard";
import { AvatarUploadZone } from "@/components/profile/AvatarUploadZone";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { jsonFetch } from "@/lib/fetcher";
import {
  useProfile,
  type PublicProfile,
} from "@/lib/hooks/useProfile";
import { validateBio, validateSocial, validateUsername } from "@/lib/profile";
import { cn } from "@/lib/utils";

export default function EditProfilePage() {
  return (
    <WalletGuard
      title="Sign in to edit your profile"
      description="Sign in to your account to update your username, photo, and bio. Saving is free — no gas required."
    >
      <EditProfileForm />
    </WalletGuard>
  );
}

function EditProfileForm() {
  const router = useRouter();
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const qc = useQueryClient();

  const {
    data: savedProfile,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useProfile(address);

  const baseline = useMemo((): PublicProfile | null => {
    if (!address) return null;
    return {
      address,
      username: null,
      avatarUrl: null,
      bio: null,
      twitter: null,
      discord: null,
      verified: false,
      badges: ["User"],
    };
  }, [address]);

  const initial = savedProfile ?? baseline;

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [discord, setDiscord] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!initial || hydrated || isLoading) return;
    setUsername(initial.username ?? "");
    setBio(initial.bio ?? "");
    setTwitter(initial.twitter ?? "");
    setDiscord(initial.discord ?? "");
    setHydrated(true);
  }, [initial, hydrated, isLoading]);

  // Revoke object URLs on unmount / replace.
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
      setRemoveAvatar(false);
    },
    [previewUrl],
  );

  const onClearAvatar = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setAvatarFile(null);
    setPreviewUrl(null);
    setRemoveAvatar(true);
  }, [previewUrl]);

  const dirty = useMemo(() => {
    if (!initial || !hydrated) return false;
    const u = username.trim();
    const b = bio.trim();
    const initU = (initial.username ?? "").trim();
    const initB = (initial.bio ?? "").trim();
    const initTw = (initial.twitter ?? "").trim();
    const initDc = (initial.discord ?? "").trim();
    return (
      u !== initU ||
      b !== initB ||
      twitter.trim() !== initTw ||
      discord.trim() !== initDc ||
      avatarFile !== null ||
      (removeAvatar && !!initial.avatarUrl)
    );
  }, [initial, hydrated, username, bio, twitter, discord, avatarFile, removeAvatar]);

  const usernameError = validateUsername(username);
  const bioError = validateBio(bio);
  const twitterError = validateSocial(twitter, "X");
  const discordError = validateSocial(discord, "Discord");
  const canSave =
    dirty &&
    !usernameError &&
    !bioError &&
    !twitterError &&
    !discordError &&
    !saving &&
    !!address;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function onSave() {
    if (!address || !canSave) return;
    setError(null);
    setSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const authHeader = { Authorization: `Bearer ${token}` };

      let avatarUrl: string | null = initial?.avatarUrl ?? null;

      if (removeAvatar) {
        avatarUrl = null;
      } else if (avatarFile) {
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
          username: username.trim() || null,
          avatarUrl,
          bio: bio.trim() || null,
          twitter: twitter.trim() || null,
          discord: discord.trim() || null,
        }),
      });

      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["userPage"] });

      push({ title: "Profile saved", variant: "success" });
      router.push(`/u/${address}`);
    } catch (err) {
      const msg = (err as Error)?.message || "Failed to save";
      setError(
        msg.includes("rejected") ? "Signature request was rejected." : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !address) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="card h-96 animate-pulse bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-28">
      <Link
        href={`/u/${address}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile is tied to your wallet address. Changes are saved
          securely to your signed-in account — no password, signature, or gas
          fee required.
        </p>
      </div>

      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="text-sm font-semibold">Profile photo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown on your bets, leaderboard, and search results.
          </p>
          <div className="mt-5">
            <AvatarUploadZone
              address={address}
              savedUrl={removeAvatar ? null : initial?.avatarUrl ?? null}
              previewUrl={previewUrl}
              onPick={onPick}
              onClear={onClearAvatar}
              disabled={saving}
            />
          </div>
        </section>

        <section className="card p-6 space-y-5">
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className={cn(
                "input mt-1.5",
                usernameError && "border-danger focus:ring-danger/40",
              )}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="satoshi"
              maxLength={20}
              autoComplete="off"
              disabled={saving}
            />
            <div className="mt-1.5 flex justify-between text-xs">
              <span
                className={cn(
                  usernameError ? "text-danger" : "text-muted-foreground",
                )}
              >
                {usernameError ??
                  "Renaming is safe — your views, PnL, comments, and rep stay tied to your wallet. Old links keep working too."}
              </span>
              <span className="text-muted-foreground">{username.length}/20</span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="bio">
              Bio
            </label>
            <textarea
              id="bio"
              className={cn(
                "textarea mt-1.5 min-h-[120px]",
                bioError && "border-danger focus:ring-danger/40",
              )}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="What kinds of bets do you take? How do you settle?"
              maxLength={280}
              disabled={saving}
            />
            <div className="mt-1.5 flex justify-between text-xs">
              <span
                className={cn(bioError ? "text-danger" : "text-muted-foreground")}
              >
                {bioError ?? "Optional — visible on your public profile."}
              </span>
              <span className="text-muted-foreground">{bio.length}/280</span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="twitter">
              X (Twitter)
            </label>
            <input
              id="twitter"
              className={cn(
                "input mt-1.5",
                twitterError && "border-danger focus:ring-danger/40",
              )}
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@username or https://x.com/username"
              maxLength={100}
              autoComplete="off"
              disabled={saving}
            />
            <p
              className={cn(
                "mt-1.5 text-xs",
                twitterError ? "text-danger" : "text-muted-foreground",
              )}
            >
              {twitterError ?? "Optional — shown on your public profile."}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="discord">
              Discord
            </label>
            <input
              id="discord"
              className={cn(
                "input mt-1.5",
                discordError && "border-danger focus:ring-danger/40",
              )}
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="username or https://discord.gg/invite"
              maxLength={100}
              autoComplete="off"
              disabled={saving}
            />
            <p
              className={cn(
                "mt-1.5 text-xs",
                discordError ? "text-danger" : "text-muted-foreground",
              )}
            >
              {discordError ?? "Optional — shown with the Discord logo on your profile."}
            </p>
          </div>
        </section>

        {isError && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p>
              Could not load your saved profile
              {loadError instanceof Error ? `: ${loadError.message}` : ""}.
              You can still edit and save — changes will be stored to your
              wallet.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium underline hover:no-underline"
              onClick={() => refetch()}
            >
              Retry load
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]">
        <div className="container flex max-w-lg items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {dirty ? "Unsaved changes" : "No changes yet"}
          </p>
          <div className="flex w-full sm:w-auto gap-2 sm:ml-auto">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              asChild
              disabled={saving}
            >
              <Link href={`/u/${address}`}>Cancel</Link>
            </Button>
            <Button
              className="flex-1 sm:flex-none min-w-[140px]"
              onClick={onSave}
              disabled={!canSave}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
