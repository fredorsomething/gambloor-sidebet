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
import "./globals.css";

// Applies the saved theme before paint (defaults to dark) to avoid FOUC.
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sidebet — P2P bets on Polygon",
  description:
    "Create and accept peer-to-peer side bets settled in USDC or pUSD on Polygon. Funds escrowed on-chain, resolved by a trusted settler.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
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
            <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
              <div className="container flex items-center gap-2 py-3 sm:gap-3 sm:py-4">
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
                <div className="flex-1 lg:hidden" />

                <NavLinks />
                <WalletBalance />
                <ConnectButton />
                <NotificationBell />
              </div>

              {/* Mobile search row */}
              <div className="container pb-3 lg:hidden">
                <SearchBar />
              </div>
            </header>

            <main className="container flex-1 py-6 sm:py-8">{children}</main>

            <footer className="border-t border-border py-6 text-xs text-muted-foreground">
              <div className="container flex flex-wrap items-center justify-between gap-4">
                <div>
                  Sidebet is non-custodial. Funds sit in an on-chain escrow until
                  the settler resolves the market.
                </div>
                <div className="flex items-center gap-4">
                  <span>Polygon · USDC · pUSD</span>
                  <a
                    href="https://discord.gg/Z9TZWXQtqm"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Join the Sidebet Discord"
                    title="Join our Discord"
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5865F2] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#4752c4]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.074.074 0 0 0-.079.037c-.34.607-.719 1.4-.984 2.024a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.997-2.024.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 5.683 4.37a.07.07 0 0 0-.032.027C3.27 7.94 2.62 11.4 2.939 14.81a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-3.94-.838-7.369-2.756-10.414a.061.061 0 0 0-.031-.028ZM8.02 12.733c-1.182 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418Z" />
                    </svg>
                  </a>
                </div>
              </div>
              <div className="container mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
                Sidebet is a brand name of Box, LLC, having its registered
                address at Omonoias Avenue 13, Limassol 3052, Cyprus. For any
                inquiries, contact us at{" "}
                <a
                  href="mailto:support@sidebet.lol"
                  className="underline hover:text-foreground"
                >
                  support@sidebet.lol
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
