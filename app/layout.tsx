import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { SiteChrome } from "@/components/SiteChrome";
import { getSiteUrl } from "@/lib/siteUrl";
import "./globals.css";

// Applies the saved theme before paint (defaults to dark) to avoid FOUC.
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Sidebet — P2P bets on Polygon",
  description:
    "Create and find peer-to-peer side-bets with 0 fees.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    siteName: "Sidebet",
    type: "website",
    title: "Sidebet — P2P bets on Polygon",
    description:
      "Cool ass gambling site",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Sidebet" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sidebet — P2P bets on Polygon",
    description:
      "Create and find peer-to-peer side-bets with 0 fees.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="font-sans">
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
