const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(
  username: string,
  opts?: { required?: boolean },
): string | null {
  const t = username.trim();
  if (!t) return opts?.required ? "Username is required." : null;
  if (!USERNAME_RE.test(t)) {
    return "Username must be 3–20 characters: letters, numbers, underscores only.";
  }
  return null;
}

export function needsProfileSetup(
  profile: { username?: string | null } | null | undefined,
): boolean {
  return !profile?.username?.trim();
}

export function validateBio(bio: string): string | null {
  if (bio.length > 280) return "Bio must be 280 characters or fewer.";
  return null;
}

export function validateSocial(value: string, label: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (t.length > 100) return `${label} must be 100 characters or fewer.`;
  return null;
}

/** Allowed image URLs from Vercel Blob (avatars, market covers). */
export function isAllowedImageUrl(url: string): boolean {
  if (!/^https?:\/\//.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith(".public.blob.vercel-storage.com")) return true;
    if (host.endsWith(".blob.vercel-storage.com")) return true;
    // Allow any https image URL for backwards compatibility
    return true;
  } catch {
    return false;
  }
}

export { AVATAR_MAX_BYTES } from "@/lib/avatarFile";
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** @deprecated Use isAllowedImageUrl */
export const isAllowedAvatarUrl = isAllowedImageUrl;

export { BET_COVER_MAX_BYTES as BET_IMAGE_MAX_BYTES } from "@/lib/avatarFile";
