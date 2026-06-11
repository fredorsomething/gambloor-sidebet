import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { BrandLogo } from "@/components/BrandLogo";
import { GlobalChat } from "@/components/GlobalChat";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { WalletBalance } from "@/components/wallet/WalletBalance";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchBar } from "@/components/SearchBar";
import { NavLinks } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
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
          <div id="app-shell" className="flex min-h-screen flex-col">
            <header className="site-header fixed inset-x-0 top-0 z-40 overflow-visible border-b border-border bg-card/95 backdrop-blur">
              <div className="container flex min-w-0 items-center gap-1.5 py-3 sm:gap-3 sm:py-4">
                <MobileNav />
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
                <BrandLogo />

                {/* Desktop search sits centered in the bar. */}
                <div className="hidden flex-1 justify-center px-2 lg:flex">
                  <SearchBar />
                </div>
                {/* Mobile keeps the bar compact; search drops to its own row. */}
                <div className="min-w-0 flex-1 lg:hidden" />

                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2">
                  <NavLinks />
                  <WalletBalance />
                  <ConnectButton />
                  <NotificationBell />
                </div>
              </div>

              {/* Mobile search row */}
              <div className="container pb-3 lg:hidden">
                <SearchBar />
              </div>
            </header>

            {/* Reserve space for the fixed header (mobile has a second search row). */}
            <div aria-hidden className="site-header-spacer shrink-0" />

            <main className="container flex-1 py-6 sm:py-8">{children}</main>

            <footer className="border-t border-border py-3 text-[11px] leading-snug text-muted-foreground">
              <div className="container flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <p>
                    Non-custodial wallets · Sidebets in on-chain escrow · Bet
                    responsibly ·{" "}
                    <a
                      href="/terms"
                      className="underline hover:text-foreground"
                    >
                      Terms
                    </a>
                    {" · "}
                    <a
                      href="/privacy"
                      className="underline hover:text-foreground"
                    >
                      Privacy
                    </a>
                  </p>
                  <p className="text-muted-foreground/65">
                    Box, LLC · Omonoias Ave 13, Limassol 3052, Cyprus ·{" "}
                    <a
                      href="mailto:support@sidebet.lol"
                      className="underline hover:text-foreground"
                    >
                    For support create a ticket in our Discord!                    </a>
                  </p>
                </div>
                <a
                  href="https://discord.gg/Z9TZWXQtqm"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Join the Sidebet Discord"
                  title="Discord"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 127.14 96.36"
                    className="h-4 w-4"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
                  </svg>
                </a>
              </div>
            </footer>
          </div>
          <GlobalChat />
        </Providers>
      </body>
    </html>
  );
}
