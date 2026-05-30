import { renderOgCard } from "@/lib/og/buildImage";

export const runtime = "nodejs";
export const alt = "Sidebet — P2P bets on Polygon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    kind: "site",
    url: "/",
    title: "Sidebet",
    subtitle: "Peer-to-peer sidebets on Polygon",
    imageUrl: "/favicon.png",
  });
}
