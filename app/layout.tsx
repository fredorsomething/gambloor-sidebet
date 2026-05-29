import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { BrandLogo } from "@/components/BrandLogo";
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
          <div className="flex min-h-screen flex-col">
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
              <div className="container flex flex-wrap items-center justify-between gap-2">
                <div>
                  Sidebet is non-custodial. Funds sit in an on-chain escrow until
                  the settler resolves the market.
                </div>
                <div>Polygon · USDC · pUSD</div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
