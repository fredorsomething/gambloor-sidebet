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
  success: "#2da562",
  danger: "#f85149",
  primary: "#1a6ef5",
  warning: "#e8850a",
};

type OgCardOptions = {
  /** Pre-fetched data URL for the thumbnail (avoids Satori remote fetch failures). */
  thumbDataUrl?: string | null;
  /** Pre-fetched party avatar data URLs for bet matchup rows. */
  partyAvatars?: {
    proposer?: string | null;
    acceptor?: string | null;
  };
};

function kindLabel(p: LinkPreviewData): string {
  if (p.kind === "profile") return "Profile";
  if (p.kind === "bet") return "Sidebet";
  if (p.kind === "market") return `Market · ${p.status ?? "Open"}`;
  return "Sidebet";
}

function betStatusDisplay(status?: string): string {
  switch (status) {
    case "Matched":
      return "Matched";
    case "Settled":
      return "Settled";
    case "Refunded":
      return "Refunded";
    case "Cancelled":
      return "Cancelled";
    default:
      return "Open";
  }
}

function betStatusColors(status?: string): {
  text: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case "Matched":
      return {
        text: C.warning,
        bg: "rgba(232, 133, 10, 0.12)",
        border: "rgba(232, 133, 10, 0.35)",
      };
    case "Settled":
      return {
        text: C.success,
        bg: "rgba(45, 165, 98, 0.12)",
        border: "rgba(45, 165, 98, 0.35)",
      };
    case "Refunded":
    case "Cancelled":
      return {
        text: C.muted,
        bg: "rgba(139, 148, 158, 0.12)",
        border: "rgba(139, 148, 158, 0.35)",
      };
    default:
      return {
        text: C.primary,
        bg: "rgba(26, 110, 245, 0.12)",
        border: "rgba(26, 110, 245, 0.35)",
      };
  }
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

const USDC_ICON = absoluteUrl("/usdc.png");

function parseStakeLabel(
  stakeLabel: string,
  tokenSymbol?: string | null,
): { amount: string; symbol: string } {
  const sym = tokenSymbol || "USDC.e";
  const suffix = ` ${sym}`;
  if (stakeLabel.endsWith(suffix)) {
    return { amount: stakeLabel.slice(0, -suffix.length), symbol: sym };
  }
  const parts = stakeLabel.trim().split(/\s+/);
  if (parts.length >= 2) {
    return {
      amount: parts.slice(0, -1).join(" "),
      symbol: parts[parts.length - 1]!,
    };
  }
  return { amount: stakeLabel, symbol: sym };
}

function OgTokenAmount({
  stakeLabel,
  tokenSymbol,
  color,
  fontSize = 28,
  iconSize = 24,
  align = "start",
  prefix,
  fontWeight = 700,
}: {
  stakeLabel: string;
  tokenSymbol?: string | null;
  color: string;
  fontSize?: number;
  iconSize?: number;
  align?: "start" | "end";
  prefix?: string;
  fontWeight?: number;
}) {
  const { amount, symbol } = parseStakeLabel(stakeLabel, tokenSymbol);
  const text = prefix
    ? `${prefix} ${amount} ${symbol}`
    : `${amount} ${symbol}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexDirection: align === "end" ? "row-reverse" : "row",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={USDC_ICON}
        alt=""
        width={iconSize}
        height={iconSize}
        style={{ borderRadius: iconSize / 2, flexShrink: 0 }}
      />
      <span
        style={{
          fontSize,
          fontWeight,
          color,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.1,
        }}
      >
        {text}
      </span>
    </div>
  );
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

function SquareThumb({
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
          preview.kind === "profile"
            ? (preview.username ?? preview.address ?? preview.title)
            : preview.title,
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

function OgStatusBadge({ status }: { status?: string }) {
  const colors = betStatusColors(status);
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        borderRadius: 999,
        fontSize: 22,
        fontWeight: 700,
        color: colors.text,
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
      }}
    >
      {betStatusDisplay(status)}
    </span>
  );
}

function OgVsPill() {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 18px",
        borderRadius: 999,
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: C.muted,
        backgroundColor: "rgba(139, 148, 158, 0.12)",
        border: `2px solid ${C.border}`,
      }}
    >
      vs
    </span>
  );
}

function partyInitials(label: string, address?: string | null): string {
  if (address) {
    return address.slice(2, 4).toUpperCase();
  }
  const clean = label.replace(/^@/, "").trim();
  if (clean.startsWith("0x")) return clean.slice(2, 4).toUpperCase();
  if (clean.toLowerCase() === "open") return "?";
  return clean.slice(0, 2).toUpperCase() || "?";
}

function OgAvatar({
  dataUrl,
  label,
  address,
  size = 56,
  muted,
  highlight,
}: {
  dataUrl?: string | null;
  label: string;
  address?: string | null;
  size?: number;
  muted?: boolean;
  highlight?: boolean;
}) {
  const seed = address ?? label;
  const borderColor = highlight ? C.success : C.border;
  if (dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={dataUrl}
        alt=""
        width={size}
        height={size}
        style={{
          borderRadius: size / 2,
          objectFit: "cover",
          border: `3px solid ${borderColor}`,
          flexShrink: 0,
        }}
      />
    );
  }

  const openSlot = label.toLowerCase() === "open" && !address;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        backgroundColor: openSlot
          ? "rgba(139, 148, 158, 0.12)"
          : colorFromSeed(seed),
        border: openSlot
          ? `2px dashed ${C.border}`
          : `3px solid ${borderColor}`,
        fontSize: Math.round(size * 0.34),
        fontWeight: 700,
        color: muted || openSlot ? C.muted : "rgba(255,255,255,0.92)",
      }}
    >
      {partyInitials(label, address)}
    </div>
  );
}

function OgPartySide({
  role,
  label,
  stakeLabel,
  outcomeLabel,
  align,
  mutedLabel,
  avatarDataUrl,
  address,
  isWinner,
  isLoser,
  payoutLabel,
  tokenSymbol,
}: {
  role: string;
  label: string;
  stakeLabel: string;
  outcomeLabel?: string;
  align: "start" | "end";
  mutedLabel?: boolean;
  avatarDataUrl?: string | null;
  address?: string | null;
  isWinner?: boolean;
  isLoser?: boolean;
  payoutLabel?: string;
  tokenSymbol?: string | null;
}) {
  const dimmed = mutedLabel || isLoser;
  const roleLabel = isWinner ? "Winner" : role;
  const avatarSize = isWinner ? 44 : 52;
  const columnGap = isWinner ? 5 : 8;
  const nameSize = isWinner ? 24 : 28;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: columnGap,
        flex: 1,
        minWidth: 0,
        width: "100%",
        maxWidth: isWinner ? "100%" : "100%",
        alignItems: align === "end" ? "flex-end" : "flex-start",
        textAlign: align === "end" ? "right" : "left",
        opacity: isLoser ? 0.72 : 1,
        padding: isWinner ? "8px 10px" : "0",
        borderRadius: isWinner ? 12 : 0,
        backgroundColor: isWinner ? "rgba(45, 165, 98, 0.1)" : "transparent",
        border: isWinner
          ? "2px solid rgba(45, 165, 98, 0.45)"
          : "2px solid transparent",
        overflow: isWinner ? "hidden" : "visible",
      }}
    >
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isWinner ? C.success : C.muted,
        }}
      >
        {roleLabel}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isWinner ? 8 : 12,
          flexDirection: align === "end" ? "row-reverse" : "row",
          maxWidth: "100%",
        }}
      >
        <OgAvatar
          dataUrl={avatarDataUrl}
          label={label}
          address={address}
          size={avatarSize}
          muted={dimmed}
          highlight={isWinner}
        />
        <span
          style={{
            fontSize: nameSize,
            fontWeight: 700,
            color: dimmed ? C.muted : C.text,
            lineHeight: 1.1,
            flexShrink: 1,
          }}
        >
          {truncate(label, isWinner ? 14 : 18)}
        </span>
      </div>
      {isWinner && payoutLabel ? (
        <OgTokenAmount
          stakeLabel={payoutLabel}
          tokenSymbol={tokenSymbol}
          color={C.success}
          fontSize={22}
          iconSize={20}
          align={align}
          prefix="Won"
        />
      ) : (
        <OgTokenAmount
          stakeLabel={stakeLabel}
          tokenSymbol={tokenSymbol}
          color={dimmed ? C.muted : C.text}
          fontSize={isWinner ? 24 : 28}
          iconSize={22}
          align={align}
        />
      )}
      {outcomeLabel && (
        <span
          style={{
            fontSize: isWinner ? 16 : 17,
            fontWeight: 600,
            color: isWinner ? C.success : C.muted,
            padding: "3px 10px",
            borderRadius: 999,
            backgroundColor: isWinner
              ? "rgba(45, 165, 98, 0.12)"
              : "rgba(139, 148, 158, 0.12)",
          }}
        >
          {truncate(outcomeLabel, 24)}
        </span>
      )}
    </div>
  );
}

function renderBetOgCard(
  preview: LinkPreviewData,
  options: OgCardOptions = {},
): ImageResponse {
  const matchup = preview.betMatchup;
  const statusColors = betStatusColors(preview.status);
  const isOpen = preview.status === "Open";
  const isSettled = preview.status === "Settled";
  const acceptorMuted = isOpen && preview.betMatchup?.acceptor.label === "Open";
  const tokenSymbol = preview.tokenSymbol;

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
          <OgStatusBadge status={preview.status} />
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: isSettled ? 16 : 20,
            background: C.card,
            border: `2px solid ${statusColors.border}`,
            borderRadius: 24,
            padding: isSettled ? "24px 36px 28px" : "32px 36px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 28,
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 18,
                overflow: "hidden",
                border: `2px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#21262d",
                flexShrink: 0,
              }}
            >
              <SquareThumb
                preview={preview}
                thumbDataUrl={options.thumbDataUrl}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                flex: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Sidebet
              </span>
              <span
                style={{
                  fontSize: isSettled ? 34 : 38,
                  fontWeight: 700,
                  color: C.text,
                  lineHeight: 1.12,
                }}
              >
                {truncate(preview.title, 70)}
              </span>
              {matchup?.poolLabel && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 20, color: C.muted }}>
                    {isSettled ? "Final pool" : "Pool"}
                  </span>
                  <OgTokenAmount
                    stakeLabel={matchup.poolLabel}
                    tokenSymbol={tokenSymbol}
                    color={C.muted}
                    fontSize={20}
                    iconSize={18}
                  />
                </div>
              )}
            </div>
          </div>

          {matchup && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                borderTop: `2px solid ${C.border}`,
                paddingTop: isSettled ? 16 : 20,
                width: "100%",
              }}
            >
              <div style={{ display: "flex", flex: 1, minWidth: 0, maxWidth: "46%" }}>
                <OgPartySide
                  role="Proposer"
                  label={matchup.proposer.label}
                  stakeLabel={matchup.proposer.stakeLabel}
                  outcomeLabel={matchup.proposer.outcomeLabel}
                  align="start"
                  avatarDataUrl={options.partyAvatars?.proposer}
                  address={matchup.proposer.address}
                  isWinner={matchup.proposer.isWinner}
                  isLoser={isSettled && !matchup.proposer.isWinner && !!matchup.resultLabel}
                  payoutLabel={matchup.proposer.payoutLabel}
                  tokenSymbol={tokenSymbol}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignSelf: "center",
                  flexShrink: 0,
                  paddingTop: 28,
                }}
              >
                <OgVsPill />
              </div>
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  minWidth: 0,
                  maxWidth: "46%",
                  justifyContent: "flex-end",
                }}
              >
                <OgPartySide
                  role="Acceptor"
                  label={matchup.acceptor.label}
                  stakeLabel={matchup.acceptor.stakeLabel}
                  outcomeLabel={matchup.acceptor.outcomeLabel}
                  align="end"
                  mutedLabel={acceptorMuted}
                  avatarDataUrl={options.partyAvatars?.acceptor}
                  address={matchup.acceptor.address}
                  isWinner={matchup.acceptor.isWinner}
                  isLoser={isSettled && !matchup.acceptor.isWinner && !!matchup.resultLabel}
                  payoutLabel={matchup.acceptor.payoutLabel}
                  tokenSymbol={tokenSymbol}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE },
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
            <SquareThumb preview={preview} thumbDataUrl={options.thumbDataUrl} />
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
            <SquareThumb preview={preview} thumbDataUrl={options.thumbDataUrl} />
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
  if (preview.kind === "bet") {
    return renderBetOgCard(preview, options);
  }
  if (preview.kind === "market") {
    return renderBetMarketOgCard(preview, options);
  }
  if (preview.kind === "profile") {
    return renderProfileOgCard(preview, options);
  }

  return renderBetMarketOgCard(preview, options);
}
