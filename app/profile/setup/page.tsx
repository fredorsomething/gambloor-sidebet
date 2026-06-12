"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { LoadingScreen } from "@/components/LoadingScreen";
import { ProfileSetupForm } from "@/components/profile/ProfileSetupForm";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useMyProfile } from "@/lib/hooks/useMyProfile";
import { needsProfileSetup } from "@/lib/profile";

export default function ProfileSetupPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const { data: profile, isFetched } = useMyProfile(address);

  useEffect(() => {
    if (!ready || !authenticated || !address || !isFetched) return;
    if (!needsProfileSetup(profile)) {
      router.replace("/home");
    }
  }, [ready, authenticated, address, isFetched, profile, router]);

  if (!ready) {
    return <LoadingScreen fullscreen />;
  }

  if (!authenticated || !address) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-5">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to set up your profile.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  if (!isFetched || !needsProfileSetup(profile)) {
    return <LoadingScreen fullscreen />;
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background px-5 py-12 sm:flex sm:min-h-0 sm:items-center sm:justify-center sm:px-8 sm:py-16">
      <ProfileSetupForm />
    </div>
  );
}
