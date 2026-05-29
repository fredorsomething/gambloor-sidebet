const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(username: string): string | null {
  const t = username.trim();
  if (!t) return null;
  if (!USERNAME_RE.test(t)) {
    return "Username must be 3–20 characters: letters, numbers, underscores only.";
  }
  return null;
}

export function validateBio(bio: string): string | null {
  if (bio.length > 280) return "Bio must be 280 characters or fewer.";
  return null;
}

/** Allowed avatar hosts after upload or legacy URLs. */
export function isAllowedAvatarUrl(url: string): boolean {
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

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
