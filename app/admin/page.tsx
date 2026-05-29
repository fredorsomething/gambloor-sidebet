"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ShieldCheck } from "lucide-react";
import { useAccount } from "wagmi";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { isAdminAddress } from "@/lib/admin";

export default function AdminPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();

  if (!ready) {
    return <div className="card h-40 animate-pulse rounded-2xl bg-muted/40" />;
  }

  if (!authenticated || !address || !isAdminAddress(address)) {
    return (
      <div className="card p-10 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Admin only</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This dashboard is restricted to the platform admin.
        </p>
      </div>
    );
  }

  return <AdminDashboard address={address} />;
}
