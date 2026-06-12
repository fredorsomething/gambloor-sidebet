"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { LoadingScreen } from "@/components/LoadingScreen";
import { useMyProfile } from "@/lib/hooks/useMyProfile";
import { needsProfileSetup } from "@/lib/profile";
import {
  isProfileSetupExemptPath,
  PROFILE_SETUP_PATH,
} from "@/lib/profileSetup";

/** Sends new accounts without a username to profile setup before the rest of the app. */
export function ProfileSetupGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const { data: profile, isFetched } = useMyProfile(address);

  const onSetupPage = pathname === PROFILE_SETUP_PATH;
  const incomplete = isFetched && needsProfileSetup(profile);
  const mustRedirect =
    incomplete && !onSetupPage && !isProfileSetupExemptPath(pathname);
  const mustLeaveSetup =
    isFetched && !needsProfileSetup(profile) && onSetupPage;

  useEffect(() => {
    if (!ready || !authenticated || !address || !isFetched) return;

    if (mustRedirect) {
      router.replace(PROFILE_SETUP_PATH);
      return;
    }

    if (mustLeaveSetup) {
      router.replace("/home");
    }
  }, [
    ready,
    authenticated,
    address,
    isFetched,
    mustRedirect,
    mustLeaveSetup,
    router,
  ]);

  if (mustRedirect || mustLeaveSetup) {
    return <LoadingScreen fullscreen />;
  }

  return <>{children}</>;
}
