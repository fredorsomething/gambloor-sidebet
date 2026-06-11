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
  tagline: string;
}[] = [
  {
    id: "sidebet",
    label: "Sidebet",
    icon: Swords,
    tagline: "1v1 with a friend",
  },
  {
    id: "market",
    label: "Market",
    icon: BarChart3,
    tagline: "Open to everyone",
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
  const showTypePicker = visibleOptions.length > 1;

  return (
    <div className="space-y-6">
      {!allowMarket && defaultType === "market" && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Prediction market creation is temporarily paused while we improve the
          order book. You can still propose sidebets.
        </div>
      )}

      {showTypePicker && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div>
                    <span className="font-semibold">{o.label}</span>
                    <p className="text-xs text-muted-foreground">{o.tagline}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

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
  );
}
