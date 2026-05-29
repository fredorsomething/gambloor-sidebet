"use client";

import { usePrivy } from "@privy-io/react-auth";

import { LoadingScreen } from "@/components/LoadingScreen";

/** Full-screen loader until Privy (and wallet layer) has finished initializing. */
export function AppReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = usePrivy();

  if (!ready) {
    return <LoadingScreen fullscreen />;
  }

  return <>{children}</>;
}
