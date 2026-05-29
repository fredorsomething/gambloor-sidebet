"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "danger";
};

const ToastCtx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, ...t }]);
    setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "card px-4 py-3 text-sm shadow-lg border",
              t.variant === "success" && "border-[hsl(var(--success))]/40",
              t.variant === "danger" && "border-[hsl(var(--danger))]/40",
            )}
          >
            <div className="font-medium">{t.title}</div>
            {t.description && (
              <div className="text-muted-foreground mt-1 break-words">
                {t.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return {
      push: (t: Omit<Toast, "id">) => {
        console.log(`[toast] ${t.title}${t.description ? ": " + t.description : ""}`);
      },
    };
  }
  return ctx;
}
