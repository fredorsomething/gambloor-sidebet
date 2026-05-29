"use client";

import { Swords, BarChart3 } from "lucide-react";
import { useState } from "react";

import { ChainGuard } from "@/components/ChainGuard";
import { CreateBetForm } from "@/components/CreateBetForm";
import { CreateMarketForm } from "@/components/markets/CreateMarketForm";
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
  const [type, setType] = useState<CreateType>(defaultType);
  const active = OPTIONS.find((o) => o.id === type)!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const selected = type === o.id;
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
        {type === "sidebet" ? (
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
