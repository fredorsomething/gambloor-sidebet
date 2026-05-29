export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const BET_COVER_MAX_BYTES = 4 * 1024 * 1024;

export const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

function extFromName(name: string): string | undefined {
  const i = name.lastIndexOf(".");
  if (i < 0) return undefined;
  return name.slice(i + 1).toLowerCase();
}

/** Sniff common image formats from the first bytes (when the browser omits `file.type`). */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  const head = String.fromCharCode(...bytes.slice(0, 6));
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function mimeToExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export type AvatarFileResolution =
  | { ok: true; mime: string; ext: string }
  | { ok: false; error: string };

/** Resolve a supported avatar MIME type (browser type, extension, or magic bytes). */
export function resolveAvatarContentType(
  file: File,
  bytes?: Uint8Array,
  maxBytes: number = AVATAR_MAX_BYTES,
): AvatarFileResolution {
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  if (file.size > maxBytes) {
    return { ok: false, error: `Image must be ${maxMb} MB or smaller.` };
  }

  let mime = (file.type || "").toLowerCase();
  if (MIME_ALIASES[mime]) mime = MIME_ALIASES[mime];

  if (mime === "image/heic" || mime === "image/heif") {
    return {
      ok: false,
      error:
        "HEIC photos are not supported. On iPhone: Photos → Share → Save as JPEG, or pick a PNG/JPEG file.",
    };
  }

  if (!AVATAR_MIME_TYPES.has(mime)) {
    const ext = extFromName(file.name);
    if (ext && EXT_TO_MIME[ext]) mime = EXT_TO_MIME[ext];
  }

  if (!AVATAR_MIME_TYPES.has(mime) && bytes) {
    const sniffed = sniffImageMime(bytes);
    if (sniffed) mime = sniffed;
  }

  if (!AVATAR_MIME_TYPES.has(mime)) {
    const hint = file.type ? ` (${file.type})` : file.name ? ` (${file.name})` : "";
    return {
      ok: false,
      error: `Unsupported image${hint}. Use JPEG, PNG, WebP, or GIF.`,
    };
  }

  return { ok: true, mime, ext: mimeToExtension(mime) };
}

/** Client-side check before showing a preview. */
export function validateAvatarFileClient(
  file: File,
  maxBytes: number = AVATAR_MAX_BYTES,
): string | null {
  const r = resolveAvatarContentType(file, undefined, maxBytes);
  return r.ok ? null : r.error;
}
