import type { Metadata } from "next";

import { resolveLinkPreview } from "@/lib/linkPreview";
import { absoluteUrl, openGraphImagePath } from "@/lib/siteUrl";

export async function buildMetadataForPath(path: string): Promise<Metadata> {
  const preview = await resolveLinkPreview(path);
  if (!preview) {
    return {
      title: "Not found — Sidebet",
      robots: { index: false },
    };
  }

  const pageUrl = absoluteUrl(preview.url);
  const imagePath = openGraphImagePath(preview.url);
  const imageUrl = absoluteUrl(imagePath);
  const description =
    preview.subtitle ??
    (preview.kind === "site" ? "Peer-to-peer sidebets on Polygon." : "Sidebet");

  return {
    title: `${preview.title} — Sidebet`,
    description,
    openGraph: {
      title: preview.title,
      description,
      url: pageUrl,
      siteName: "Sidebet",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: preview.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description,
      images: [imageUrl],
    },
  };
}
