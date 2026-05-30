"use client";

import { Swords, BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";

import { ChainGuard } from "@/components/ChainGuard";
import { CreateBetForm } from "@/components/CreateBetForm";
import { CreateMarketForm } from "@/components/markets/CreateMarketForm";
import { usePlatformSettings } from "@/lib/hooks/usePlatformSettings";
import { cn } from "@/lib/utils";

type CreateType = "sidebet" | "market";

const OPTIONS: {
  id: CreateType;
  label: string;
  icon: typeof Swords;
  description: string;
}[] = [
  {
    id: "sidebet",
    label: "Sidebet",
    icon: Swords,
    description:
      "A private 1v1 escrow. You pick your side and stake; one counterparty takes the other side. Best for settling a specific argument with a friend.",
  },
  {
    id: "market",
    label: "Market",
    icon: BarChart3,
    description:
      "A public prediction market with an order book. Anyone can buy and sell shares of each outcome. Best for opening a bet to the whole site.",
  },
];

export function CreateChooser({
  defaultType = "sidebet",
}: {
  defaultType?: CreateType;
}) {
  const platformQ = usePlatformSettings();
  const allowMarket = platformQ.data?.allowMarketCreation ?? false;
  const visibleOptions = useMemo(
    () => (allowMarket ? OPTIONS : OPTIONS.filter((o) => o.id === "sidebet")),
    [allowMarket],
  );
  const initialType: CreateType =
    defaultType === "market" && !allowMarket ? "sidebet" : defaultType;
  const [type, setType] = useState<CreateType>(initialType);
  const effectiveType =
    type === "market" && !allowMarket ? "sidebet" : type;
  const active =
    visibleOptions.find((o) => o.id === effectiveType) ?? visibleOptions[0]!;

  return (
    <div className="space-y-6">
      {!allowMarket && defaultType === "market" && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Prediction market creation is temporarily paused while we improve the
          order book. You can still propose sidebets.
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          visibleOptions.length > 1 && "sm:grid-cols-2",
        )}
      >
        {visibleOptions.map((o) => {
          const Icon = o.icon;
          const selected = effectiveType === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setType(o.id)}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-all",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-semibold">{o.label}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {o.description}
              </p>
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold">
          {type === "sidebet" ? "Propose a sidebet" : "Create a market"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">{active.description}</p>
        {effectiveType === "sidebet" ? (
          <ChainGuard>
            <CreateBetForm />
          </ChainGuard>
        ) : (
          <ChainGuard require="market">
            <CreateMarketForm />
          </ChainGuard>
        )}
      </div>
    </div>
  );
}
