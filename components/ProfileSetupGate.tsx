"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/LoadingScreen";
import { useMyProfile } from "@/lib/hooks/useMyProfile";
import { needsProfileSetup } from "@/lib/profile";
import {
  isProfileSetupExemptPath,
  PROFILE_SETUP_PATH,
} from "@/lib/profileSetup";

/** Sends signed-in accounts without a username to profile setup before the rest of the app. */
export function ProfileSetupGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, authenticated } = usePrivy();
  const {
    data: profile,
    isFetched,
    isLoading,
    isFetching,
    isError,
  } = useMyProfile();

  const profilePending =
    authenticated && !isError && (isLoading || isFetching || !isFetched);

  const onSetupPage = pathname === PROFILE_SETUP_PATH;
  const incomplete =
    authenticated && isFetched && !isError && needsProfileSetup(profile);
  const mustRedirect =
    incomplete && !onSetupPage && !isProfileSetupExemptPath(pathname);
  const mustLeaveSetup =
    authenticated &&
    isFetched &&
    !isError &&
    !needsProfileSetup(profile) &&
    onSetupPage;

  useEffect(() => {
    if (!ready || !authenticated || profilePending) return;

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
    profilePending,
    mustRedirect,
    mustLeaveSetup,
    router,
  ]);

  if (profilePending || mustRedirect || mustLeaveSetup) {
    return <LoadingScreen fullscreen />;
  }

  return <>{children}</>;
}
