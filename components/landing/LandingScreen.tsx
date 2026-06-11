"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import {
  BirdIntroCollect,
  BirdThinking,
  BirdsAgree,
  BirdsChat,
  BirdsSettler,
  RiftPortal,
} from "@/components/landing/OnboardingVisuals";
import { useProfile } from "@/lib/hooks/useProfile";
import { needsProfileSetup } from "@/lib/profile";
import { PROFILE_SETUP_PATH } from "@/lib/profileSetup";
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type Slide = {
  id: string;
  label: string;
  title: string;
  lines?: string[];
  bullets?: string[];
};

const SLIDES: Slide[] = [
  {
    id: "intro",
    label: "Welcome",
    title: "Sidebet.lol offers proper sidebets.",
    lines: [
      "Crazy we know.",
      "1v1 bets with a friend or fatal enemy on Polygon.",
      "Zero fees. On-chain escrow.",
      "No monkey-business."
    ],
  },
  {
    id: "create",
    label: "How it works",
    title: "Start a bet in minutes.",
    bullets: [
      "Create a bet and write your rules.",
      "Share your link.",
      "Your counterparty takes the other side.",
    ],
  },
  {
    id: "settle",
    label: "Settlement",
    title: "Resolving sidebets.",
    lines: [
      "If you can both agree on who won, you get paid out automatically.",
      "Be a good sport and settle your bets!",
    ],
  },
  {
    id: "settler",
    label: "If you disagree",
    title: "A trusted settler decides.",
    lines: [
      "You both agree on the settler BEFORE the bet — usually an Admin or someone you both trust.",
      "Make sure you write detailed rules so there's no confusion!",
      "So far, 100% of sidebets have been settled correctly according to both parties.",
    ],
  },
  {
    id: "social",
    label: "community",
    title: "Not just a bet slip.",
    bullets: [
      "Retarded global chat like 2016 Clash of Clans.",
      "Profiles, rep, and comments on every bet.",
      "Public PNLs and leaderboards.",
    ],
  },
  {
    id: "signin",
    label: "",
    title: "",
    lines: [],
  },
];

export function LandingScreen({
  mode = "gate",
}: {
  /** gate: only for first visit at / — replay: always show at /onboarding */
  mode?: "gate" | "replay";
}) {
  const router = useRouter();
  const { ready: privyReady, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { data: profile, isFetched: profileFetched } = useProfile(address);
  const [booted, setBooted] = useState(false);
  const [step, setStep] = useState(0);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [loginOpening, setLoginOpening] = useState(false);

  const slide = SLIDES[step]!;
  const isLast = step === SLIDES.length - 1;

  const finish = useCallback(() => {
    markOnboardingComplete();
    if (address && profileFetched && needsProfileSetup(profile)) {
      router.push(PROFILE_SETUP_PATH);
      return;
    }
    router.push("/home");
  }, [address, profile, profileFetched, router]);

  const next = useCallback(() => {
    if (!isLast) setStep((s) => s + 1);
  }, [isLast]);

  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleFinal = useCallback(() => {
    if (authenticated) {
      if (!address || !profileFetched) {
        setAwaitingAuth(true);
        return;
      }
      finish();
      return;
    }
    setAwaitingAuth(true);
    setLoginOpening(true);
    void login();
  }, [authenticated, address, profileFetched, finish, login]);

  useEffect(() => {
    if (mode === "replay") {
      setBooted(true);
      return;
    }
    if (hasCompletedOnboarding()) {
      router.replace("/home");
      return;
    }
    setBooted(true);
  }, [router, mode]);

  useEffect(() => {
    if (!awaitingAuth || !authenticated || !address || !profileFetched) return;
    setLoginOpening(false);
    finish();
  }, [awaitingAuth, authenticated, address, profileFetched, finish]);

  useEffect(() => {
    if (authenticated) {
      setLoginOpening(false);
      return;
    }
    if (!loginOpening) return;
    const t = window.setTimeout(() => setLoginOpening(false), 2000);
    return () => window.clearTimeout(t);
  }, [loginOpening, authenticated]);

  useEffect(() => {
    if (!booted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") back();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLast) handleFinal();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booted, isLast, next, back, handleFinal]);

  if (!booted || !privyReady) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-5 py-10 sm:px-8">
      <div className="relative w-full max-w-md">
        {!isLast && (
          <span className="absolute -top-8 right-0 text-xs tabular-nums text-muted-foreground">
            {step + 1} / {SLIDES.length - 1}
          </span>
        )}

        {isLast ? (
          <RiftPortal
            onEnter={handleFinal}
            pending={loginOpening && !authenticated}
          />
        ) : (
          <div className="relative mt-4">
            <article
              key={slide.id}
              className="onboarding-step onboarding-card relative flex h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:h-[30rem] sm:p-8"
            >
              <div className="onboarding-visual-slot relative h-48 w-full shrink-0 sm:h-52">
                {slide.id === "intro" && <BirdIntroCollect />}
                {slide.id === "create" && <BirdThinking />}
                {slide.id === "settle" && <BirdsAgree />}
                {slide.id === "settler" && <BirdsSettler />}
                {slide.id === "social" && <BirdsChat />}
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {slide.label}
                </p>
                <h1
                  className={cn(
                    "mt-2 font-semibold leading-snug tracking-tight",
                    slide.id === "settler"
                      ? "text-xl sm:text-2xl"
                      : "text-2xl",
                  )}
                >
                  {slide.title}
                </h1>

                {slide.lines && slide.lines.length > 0 && (
                  <div
                    className={cn(
                      slide.id === "settler"
                        ? "mt-3 space-y-2"
                        : "mt-4 space-y-2.5",
                    )}
                  >
                    {slide.lines.map((line) => (
                      <p
                        key={line}
                        className={cn(
                          "text-muted-foreground",
                          slide.id === "settler"
                            ? "text-xs leading-snug sm:text-[13px]"
                            : "text-sm leading-relaxed sm:text-base",
                        )}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}

                {slide.bullets && (
                  <ol className="mt-4 space-y-2.5">
                    {slide.bullets.map((item, i) => (
                      <li key={item} className="flex gap-3 text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold tabular-nums">
                          {i + 1}
                        </span>
                        <span className="pt-0.5 text-sm leading-snug text-muted-foreground sm:text-base">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </article>
          </div>
        )}

        <nav
          className={cn("flex justify-center", isLast ? "mt-6" : "mt-8")}
          aria-label="Onboarding"
        >
          {!isLast ? (
            <div className="inline-flex items-center gap-4 sm:gap-5">
              <button
                type="button"
                onClick={back}
                disabled={step === 0}
                className="onboarding-nav-arrow p-2 disabled:opacity-20"
                aria-label="Previous"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={next}
                className="onboarding-nav-next px-1 py-2 text-sm font-medium"
              >
                <span className="onboarding-nav-glow">Next</span>
              </button>
              <button
                type="button"
                onClick={next}
                className="onboarding-nav-arrow p-2"
                aria-label="Next"
              >
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="onboarding-nav-arrow p-2 disabled:opacity-20"
              aria-label="Previous"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
