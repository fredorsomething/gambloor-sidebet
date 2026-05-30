"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { ConnectButton } from "@/components/ConnectButton";

/** Redirects to the viewer's profile badges modal, or prompts connect. */
export default function SupportPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    router.replace(`/u/${address.toLowerCase()}?badges=1`);
  }, [ready, authenticated, address, router]);

  if (!ready) return null;

  if (authenticated && address) {
    return (
      <div className="card p-8 text-center text-sm text-muted-foreground">
        Opening badges…
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Support the platform</h1>
      <p className="text-sm text-muted-foreground">
        Connect your wallet to get the Supporter badge on your profile.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}
