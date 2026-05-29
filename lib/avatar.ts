/**
 * Deterministic, dependency-free identicon. Produces a stable gradient + blocky
 * pattern from an address so every user has a recognizable default avatar
 * before they upload their own.
 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarGradient(address: string): { from: string; to: string } {
  const h = hashStr(address.toLowerCase());
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 8) % 80)) % 360;
  return {
    from: `hsl(${hue1} 80% 58%)`,
    to: `hsl(${hue2} 75% 48%)`,
  };
}

/** Inline SVG data URI for an <img src>. 5x5 mirrored blocky identicon. */
export function avatarDataUri(address: string, size = 64): string {
  const seed = address.toLowerCase();
  const { from, to } = avatarGradient(seed);
  const h = hashStr(seed);
  const cells: string[] = [];
  const cellSize = size / 5;
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 5; y++) {
      const bit = (h >> (x * 5 + y)) & 1;
      if (!bit) continue;
      const fx = x * cellSize;
      const mx = (4 - x) * cellSize;
      const fy = y * cellSize;
      cells.push(
        `<rect x="${fx}" y="${fy}" width="${cellSize}" height="${cellSize}" fill="rgba(255,255,255,0.85)"/>`,
      );
      if (x !== 2)
        cells.push(
          `<rect x="${mx}" y="${fy}" width="${cellSize}" height="${cellSize}" fill="rgba(255,255,255,0.85)"/>`,
        );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
</linearGradient></defs>
<rect width="${size}" height="${size}" fill="url(#g)"/>${cells.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
