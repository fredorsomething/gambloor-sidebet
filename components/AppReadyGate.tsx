"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/LoadingScreen";

/** Full-screen loader until Privy (and wallet layer) has finished initializing. */
export function AppReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = usePrivy();

  // Overlays (chat, menus) can leave the page scrolled by ~header height, clipping the nav.
  useEffect(() => {
    if (!ready) return;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y > 0 && y < 140 && !window.location.hash) {
        window.scrollTo(0, 0);
      }
    });
  }, [ready]);

  if (!ready) {
    return <LoadingScreen fullscreen />;
  }

  return <>{children}</>;
}
