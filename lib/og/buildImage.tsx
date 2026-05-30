import { ImageResponse } from "next/og";

import type { LinkPreviewData } from "@/lib/linkPreview";
import { absoluteUrl } from "@/lib/siteUrl";

export const OG_SIZE = { width: 1200, height: 630 } as const;

const C = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#30363d",
  text: "#e6edf3",
  muted: "#8b949e",
  success: "#3fb950",
  danger: "#f85149",
};

type OgCardOptions = {
  /** Pre-fetched data URL for the thumbnail (avoids Satori remote fetch failures). */
  thumbDataUrl?: string | null;
};

function kindLabel(p: LinkPreviewData): string {
  if (p.kind === "profile") return "Profile";
  if (p.kind === "bet") return `Sidebet · ${p.status ?? "Open"}`;
  if (p.kind === "market") return `Market · ${p.status ?? "Open"}`;
  return "Sidebet";
}

function colorFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  const h = hash;
  const s = 0.7;
  const l = 0.52;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const channel = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * channel)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function initialsFor(preview: LinkPreviewData): string {
  if (preview.kind === "profile") {
    const name = preview.username ?? preview.address ?? preview.title;
    const clean = name.replace(/^@/, "").trim();
    if (clean.startsWith("0x")) return clean.slice(2, 4).toUpperCase();
    return clean.slice(0, 2).toUpperCase() || "?";
  }
  return preview.title.trim().slice(0, 2).toUpperCase() || "?";
}

function pnlText(p: LinkPreviewData): string | null {
  if (p.kind !== "profile" || p.pnl == null) return null;
  const sign = p.pnl > 0 ? "+" : p.pnl < 0 ? "−" : "";
  return `${sign}$${Math.abs(p.pnl).toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(p.pnl) >= 100 ? 0 : 2,
  })} PnL`;
}

function pnlColor(pnl: number): string {
  return pnl >= 0 ? C.success : C.danger;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function heroSrc(
  preview: LinkPreviewData,
  thumbDataUrl?: string | null,
): string | null {
  if (thumbDataUrl) return thumbDataUrl;
  if (!preview.imageUrl) return null;
  return preview.imageUrl.startsWith("http")
    ? preview.imageUrl
    : absoluteUrl(preview.imageUrl);
}

function HeroImage({
  preview,
  thumbDataUrl,
  height,
  fontSize = 64,
}: {
  preview: LinkPreviewData;
  thumbDataUrl?: string | null;
  height: number;
  fontSize?: number;
}) {
  const src = heroSrc(preview, thumbDataUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={1200}
        height={height}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colorFromSeed(preview.title),
        fontSize,
        fontWeight: 700,
        color: "rgba(255,255,255,0.92)",
      }}
    >
      {initialsFor(preview)}
    </div>
  );
}

function OgHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absoluteUrl("/favicon.png")}
          alt=""
          width={40}
          height={40}
          style={{ borderRadius: 10 }}
        />
        <span style={{ fontSize: 28, fontWeight: 700, color: C.text }}>
          sidebet.lol
        </span>
      </div>
      <span style={{ fontSize: 22, color: C.muted }}>{label}</span>
    </div>
  );
}

function renderBetMarketOgCard(
  preview: LinkPreviewData,
  options: OgCardOptions = {},
): ImageResponse {
  const label = kindLabel(preview);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          padding: 48,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <OgHeader label={label} />

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            background: C.card,
            border: `2px solid ${C.border}`,
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: 300,
              display: "flex",
              overflow: "hidden",
              borderBottom: `2px solid ${C.border}`,
            }}
          >
            <HeroImage
              preview={preview}
              thumbDataUrl={options.thumbDataUrl}
              height={300}
              fontSize={80}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "28px 36px 32px",
            }}
          >
            <span
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.15,
              }}
            >
              {truncate(preview.title, 80)}
            </span>
            {preview.subtitle && (
              <span style={{ fontSize: 26, color: C.muted }}>
                {truncate(preview.subtitle, 70)}
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

function ProfileThumb({
  preview,
  thumbDataUrl,
}: {
  preview: LinkPreviewData;
  thumbDataUrl?: string | null;
}) {
  const src = heroSrc(preview, thumbDataUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={200}
        height={200}
        style={{ objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colorFromSeed(
          preview.username ?? preview.address ?? preview.title,
        ),
        fontSize: 64,
        fontWeight: 700,
        color: "rgba(255,255,255,0.92)",
      }}
    >
      {initialsFor(preview)}
    </div>
  );
}

function profileJoinLine(p: LinkPreviewData): string | null {
  if (p.kind !== "profile" || !p.joinedAt) return null;
  return `Date joined: ${p.joinedAt}`;
}

function renderProfileOgCard(
  preview: LinkPreviewData,
  options: OgCardOptions = {},
): ImageResponse {
  const label = kindLabel(preview);
  const pnl = pnlText(preview);
  const joined = profileJoinLine(preview);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          padding: 48,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <OgHeader label={label} />

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 40,
            background: C.card,
            border: `2px solid ${C.border}`,
            borderRadius: 24,
            padding: 40,
          }}
        >
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 20,
              overflow: "hidden",
              border: `2px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#21262d",
              flexShrink: 0,
            }}
          >
            <ProfileThumb preview={preview} thumbDataUrl={options.thumbDataUrl} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.15,
              }}
            >
              {truncate(preview.title, 80)}
            </span>

            {joined && (
              <span style={{ fontSize: 28, color: C.muted }}>
                {truncate(joined, 60)}
              </span>
            )}

            {pnl && (
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: pnlColor(preview.pnl ?? 0),
                }}
              >
                {pnl}
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

export function renderOgCard(
  preview: LinkPreviewData,
  options: OgCardOptions = {},
): ImageResponse {
  if (preview.kind === "bet" || preview.kind === "market") {
    return renderBetMarketOgCard(preview, options);
  }
  if (preview.kind === "profile") {
    return renderProfileOgCard(preview, options);
  }

  return renderBetMarketOgCard(preview, options);
}
