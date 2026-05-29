"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { Avatar } from "@/components/profile/Identity";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { buildProfileMessage } from "@/lib/auth";
import { jsonFetch } from "@/lib/fetcher";
import type { PublicProfile } from "@/lib/hooks/useProfile";

export function EditProfileModal({
  current,
  onClose,
}: {
  current: PublicProfile | null;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { push } = useToast();
  const qc = useQueryClient();

  const [username, setUsername] = useState(current?.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(current?.avatarUrl ?? "");
  const [bio, setBio] = useState(current?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSave() {
    if (!address) return;
    setError(null);
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError("Username must be 3–20 chars: letters, numbers, underscores.");
      return;
    }
    if (avatarUrl && !/^https?:\/\//.test(avatarUrl)) {
      setError("Avatar must be an http(s) image URL.");
      return;
    }
    setSaving(true);
    try {
      const issuedAt = new Date().toISOString();
      const message = buildProfileMessage(address, issuedAt);
      const signature = await signMessageAsync({ message });

      await jsonFetch(`/api/users/${address}`, {
        method: "PUT",
        body: JSON.stringify({
          message,
          signature,
          username: username || null,
          avatarUrl: avatarUrl || null,
          bio: bio || null,
        }),
      });

      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["userPage"] });
      push({
        title: "Profile saved",
        variant: "success",
      });
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || "Failed to save";
      setError(
        msg.includes("rejected") ? "Signature request was rejected." : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit profile</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Avatar address={address ?? ""} url={avatarUrl || null} size={56} />
          <div className="text-xs text-muted-foreground">
            Paste an image URL below to change your picture. We show a generated
            identicon by default.
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="satoshi"
              maxLength={20}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Avatar URL</span>
            <input
              className="input"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…/me.png"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Bio</span>
            <textarea
              className="textarea min-h-[80px]"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Degenerate sports bettor. Will settle fairly."
              maxLength={280}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Sign to save…" : "Save profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
