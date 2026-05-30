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
  primary: "#539bf5",
  success: "#3fb950",
  danger: "#f85149",
};

function kindLabel(p: LinkPreviewData): string {
  if (p.kind === "profile") return "Profile";
  if (p.kind === "bet") return `Sidebet · ${p.status ?? "Open"}`;
  if (p.kind === "market") return `Market · ${p.status ?? "Open"}`;
  return "Sidebet";
}

function thumbSrc(p: LinkPreviewData): string {
  if (p.imageUrl) {
    return p.imageUrl.startsWith("http") ? p.imageUrl : absoluteUrl(p.imageUrl);
  }
  return absoluteUrl("/favicon.png");
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

export function renderOgCard(preview: LinkPreviewData): ImageResponse {
  const label = kindLabel(preview);
  const pnl = pnlText(preview);
  const src = thumbSrc(preview);

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
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
            <span
              style={{ fontSize: 28, fontWeight: 700, color: C.text }}
            >
              sidebet.lol
            </span>
          </div>
          <span style={{ fontSize: 22, color: C.muted }}>{label}</span>
        </div>

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              width={200}
              height={200}
              style={{ objectFit: "cover" }}
            />
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

            {preview.subtitle && (
              <span
                style={{
                  fontSize: 28,
                  color: C.muted,
                }}
              >
                {truncate(preview.subtitle, 60)}
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
