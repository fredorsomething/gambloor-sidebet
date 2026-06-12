"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { TokenIcon } from "@/components/ui/TokenIcon";
import { cn } from "@/lib/utils";

function ThoughtBubble({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "max-w-[9.5rem] rounded-2xl border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium leading-snug text-foreground shadow-sm sm:max-w-[10.5rem] sm:px-3 sm:py-2 sm:text-xs",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

const MARKET_EXAMPLES = [
  "Will Pragg win Norway Chess?",
  "Will Domer write a X thread on the MSTR market?",
  "Nettspend wins artist of the year?",
  "Polymarket Airdrop by 2027?",
  "@ithinkthisisgod PNL Up or Down Today?",
  "Cowboys win a playoff game?",
  "Clavicular pregnancy?",
  "Massie X post by end of June?",
  "Trump mentions MTG in next Truth Social post?",
  "Knicks make the Eastern Conference Finals?",
];

const BUBBLE_SLOTS = [
  { top: "4%", left: "0" },
  { top: "6%", right: "0" },
  { top: "20%", left: "2%" },
  { top: "18%", right: "0" },
  { top: "34%", left: "16%" },
  { top: "30%", right: "4%" },
];

type IdeaBubble = {
  id: number;
  text: string;
  top: string;
  left?: string;
  right?: string;
};

function IntroUsdc({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "absolute z-10 flex items-center justify-center rounded-full border border-success/40 bg-success/10 p-1 shadow-sm",
        className,
      )}
      aria-hidden
    >
      <TokenIcon symbol="USDC.e" size={20} />
    </div>
  );
}

export function BirdIntroCollect() {
  return (
    <div className="onboarding-intro-scene relative mx-auto h-full w-full max-w-xs overflow-hidden">
      <IntroUsdc className="onboarding-intro-stake-l" />
      <IntroUsdc className="onboarding-intro-stake-r" />

      <div className="onboarding-intro-bird-l-move absolute bottom-[18%] z-20">
        <div className="onboarding-intro-bird-l-flip">
          <div className="onboarding-intro-bird-l-waddle">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 sm:h-14 sm:w-14"
              priority
            />
          </div>
        </div>
      </div>

      <div className="onboarding-intro-bird-r-move absolute bottom-[18%] z-20">
        <div className="onboarding-intro-bird-r-flip">
          <div className="onboarding-intro-bird-r-waddle">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 sm:h-14 sm:w-14"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BirdThinking() {
  const [bubbles, setBubbles] = useState<IdeaBubble[]>([]);
  const ideaIdx = useRef(0);
  const slotIdx = useRef(0);
  const bubbleId = useRef(0);

  useEffect(() => {
    function spawn() {
      const slot = BUBBLE_SLOTS[slotIdx.current % BUBBLE_SLOTS.length]!;
      slotIdx.current += 1;
      const text = MARKET_EXAMPLES[ideaIdx.current % MARKET_EXAMPLES.length]!;
      ideaIdx.current += 1;
      const id = ++bubbleId.current;
      const next: IdeaBubble = { id, text, ...slot };
      setBubbles((prev) => [...prev.slice(-2), next]);
    }

    spawn();
    const tick = setInterval(spawn, 2400);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="relative mx-auto h-full w-full max-w-xs overflow-hidden">
      {bubbles.map((bubble) => (
        <ThoughtBubble
          key={bubble.id}
          className="onboarding-idea-pop absolute max-w-[9rem] whitespace-normal sm:max-w-[10rem]"
          style={{
            top: bubble.top,
            left: bubble.left,
            right: bubble.right,
          }}
        >
          {bubble.text}
        </ThoughtBubble>
      ))}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <Image
          src="/sidebet_bird.png"
          alt=""
          width={64}
          height={64}
          className="onboarding-bird-think h-14 w-14 sm:h-16 sm:w-16"
        />
      </div>
    </div>
  );
}

export function BirdsAgree() {
  return (
    <div className="relative mx-auto h-full w-full max-w-xs">
      <div className="absolute bottom-0 left-2 flex flex-col items-center">
        <div className="onboarding-bubble mb-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold sm:text-sm">
          ggs bro
        </div>
        <Image
          src="/sidebet_bird.png"
          alt=""
          width={56}
          height={56}
          className="onboarding-bird-nod h-12 w-12 sm:h-14 sm:w-14"
        />
      </div>

      <div className="absolute bottom-0 right-2 flex flex-col items-center">
        <span className="onboarding-usdc-pop mb-2 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2.5 py-1 text-sm font-bold text-success shadow-sm">
          <span className="text-base leading-none">+</span>
          <TokenIcon symbol="USDC.e" size={22} />
        </span>
        <div className="scale-x-[-1]">
          <Image
            src="/sidebet_bird.png"
            alt=""
            width={56}
            height={56}
            className="onboarding-bird-nod h-12 w-12 sm:h-14 sm:w-14"
            style={{ animationDelay: "0.12s" }}
          />
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 h-px w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-success/50 to-transparent" />
    </div>
  );
}

export function BirdsSettler() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setPhase((p) => (p + 1) % 4), 2200);
    return () => clearInterval(tick);
  }, []);

  const reviewing = phase === 1;
  const paidOut = phase >= 2;

  return (
    <div className="relative mx-auto h-full w-full max-w-sm">
      <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
        <span
          className={cn(
            "mb-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-all sm:text-xs",
            reviewing
              ? "border-warning/50 bg-warning/15 text-warning"
              : paidOut
                ? "border-success/40 bg-success/15 text-success"
                : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {paidOut ? "paid out" : reviewing ? "reviewing dispute" : "settler"}
        </span>
        <Image
          src="/sidebet_bird.png"
          alt=""
          width={60}
          height={60}
          className={cn(
            "h-14 w-14 sm:h-16 sm:w-16",
            reviewing && "onboarding-settler-drop",
          )}
        />
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-0 flex flex-col items-center transition-opacity duration-500",
          paidOut && "opacity-40",
        )}
      >
        <div className="onboarding-bubble mb-1 rounded-2xl rounded-bl-sm border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning sm:text-sm">
          I won!!
        </div>
        <Image
          src="/sidebet_bird.png"
          alt=""
          width={52}
          height={52}
          className="onboarding-bird-shake h-11 w-11 sm:h-12 sm:w-12"
        />
      </div>

      <div className="absolute bottom-0 right-0 flex flex-col items-center">
        {paidOut && (
          <span className="onboarding-usdc-pop mb-1 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs font-bold text-success">
            <TokenIcon symbol="USDC.e" size={16} />
            +50
          </span>
        )}
        <div className="onboarding-bubble mb-1 rounded-2xl rounded-br-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold sm:text-sm">
          Liar.
        </div>
        <div className="scale-x-[-1]">
          <Image
            src="/sidebet_bird.png"
            alt=""
            width={52}
            height={52}
            className={cn(
              "h-11 w-11 sm:h-12 sm:w-12",
              paidOut ? "onboarding-bird-nod" : "onboarding-bird-shake",
            )}
            style={{ animationDelay: "0.1s" }}
          />
        </div>
      </div>

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <line
          x1="22%"
          y1="78%"
          x2="50%"
          y2="36%"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className="text-muted-foreground/25 onboarding-payout-line"
        />
        <line
          x1="78%"
          y1="78%"
          x2="50%"
          y2="36%"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className="text-muted-foreground/25 onboarding-payout-line"
          style={{ animationDelay: "0.15s" }}
        />
        <line
          x1="50%"
          y1="36%"
          x2="78%"
          y2="70%"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
          className={cn(
            "onboarding-payout-line transition-opacity duration-500",
            paidOut ? "text-success/60 opacity-100" : "text-success/20 opacity-0",
          )}
          style={{ animationDelay: "0.3s" }}
        />
      </svg>
    </div>
  );
}

const TRASHTALK = [
  {
    left: "shut up u broke degenerate",
    right: "your mother fucked to buy bricks to build your sister a whorehouse",
  },
  {
    left: "pay up pig",
    right: "at least im not turkish lil bro",
  },
  {
    left: "I love jewish women",
    right: "yeah i feel u twin mossad baddies or sum",
  },
  {
    left: "anyways my address is 123 street street",
    right: "oh cool i just live with my mom",
  },
  {
    left: "no wonder u get no play sonion ring",
    right: "be nice or ill tell peter thiel to activate the goybeam",
  },
  {
    left: "have you ever heard the joke about a one-eyed mexican and three strippers who wash up on a beach?",
    right: "i aint reading allat this is a loop dumbass",
  },
];

type ChatMsg = { id: number; side: "left" | "right"; text: string };

function BirdSteam({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -top-3 flex gap-0.5",
        side === "left" ? "left-2" : "right-2",
      )}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="onboarding-steam-puff h-3 w-1 rounded-full bg-muted-foreground/50"
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </div>
  );
}

export function BirdsChat() {
  const [pairIdx, setPairIdx] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [rageSide, setRageSide] = useState<"left" | "right" | null>(null);
  const msgId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const pair = TRASHTALK[pairIdx % TRASHTALK.length]!;

    async function runExchange() {
      setRageSide("left");
      await wait(1500);
      if (cancelled) return;
      setRageSide(null);
      pushMsg("left", pair.left);
      await wait(1200);
      if (cancelled) return;

      setRageSide("right");
      await wait(1100);
      if (cancelled) return;
      setRageSide(null);
      pushMsg("right", pair.right);
      await wait(2400);
      if (cancelled) return;

      setPairIdx((i) => i + 1);
    }

    function pushMsg(side: "left" | "right", text: string) {
      const id = ++msgId.current;
      setMessages((prev) => [...prev.slice(-3), { id, side, text }]);
    }

    void runExchange();
    return () => {
      cancelled = true;
    };
  }, [pairIdx]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-0 flex h-[58%] w-[11.5rem] -translate-x-1/2 flex-col justify-end gap-1.5 overflow-hidden sm:w-[13rem]">
        {messages.map((m, i) => (
          <div
            key={m.id}
            className={cn(
              "onboarding-chat-msg max-w-[95%] rounded-xl px-2.5 py-1.5 text-[11px] font-medium leading-snug shadow-sm sm:text-xs",
              m.side === "left"
                ? "self-start rounded-bl-sm border border-border bg-card"
                : "self-end rounded-br-sm border border-primary/25 bg-primary/10",
              i < messages.length - 2 && "opacity-40",
              i === messages.length - 2 && "opacity-70",
            )}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="absolute bottom-0 left-1/2 flex w-[72%] max-w-[14rem] -translate-x-1/2 items-end justify-between sm:w-[68%]">
        <div className="relative">
          {rageSide === "left" && <BirdSteam side="left" />}
          <Image
            src="/sidebet_bird.png"
            alt=""
            width={56}
            height={56}
            className={cn(
              "h-11 w-11 sm:h-12 sm:w-12",
              rageSide === "left"
                ? "onboarding-bird-rage"
                : "onboarding-bird-wiggle",
            )}
          />
        </div>

        <div className="relative">
          {rageSide === "right" && <BirdSteam side="right" />}
          <div className="scale-x-[-1]">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={56}
              height={56}
              className={cn(
                "h-11 w-11 sm:h-12 sm:w-12",
                rageSide === "right"
                  ? "onboarding-bird-rage"
                  : "onboarding-bird-wiggle",
              )}
              style={{ animationDelay: "0.15s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function BirdsOnchain() {
  return (
    <div className="relative mx-auto h-full w-full max-w-xs">
      <div className="absolute left-1/2 top-[18%] flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="onboarding-usdc-pop flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
          <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
            <TokenIcon symbol="USDC.e" size={16} />
            escrow
          </span>
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <TokenIcon symbol="POL" size={16} />
            Polygon
          </span>
        </div>
        <p className="max-w-[11rem] text-center text-[10px] font-medium leading-snug text-muted-foreground sm:text-[11px]">
          Stakes lock on-chain until settlement pays out.
        </p>
      </div>

      <div className="absolute bottom-0 left-1 flex flex-col items-center">
        <Image
          src="/sidebet_bird.png"
          alt=""
          width={52}
          height={52}
          className="onboarding-bird-nod h-11 w-11 sm:h-12 sm:w-12"
        />
      </div>

      <div className="absolute bottom-0 right-1 flex flex-col items-center">
        <div className="scale-x-[-1]">
          <Image
            src="/sidebet_bird.png"
            alt=""
            width={52}
            height={52}
            className="onboarding-bird-nod h-11 w-11 sm:h-12 sm:w-12"
            style={{ animationDelay: "0.15s" }}
          />
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <line
          x1="22%"
          y1="72%"
          x2="50%"
          y2="34%"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className="text-success/30 onboarding-payout-line"
        />
        <line
          x1="78%"
          y1="72%"
          x2="50%"
          y2="34%"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className="text-success/30 onboarding-payout-line"
          style={{ animationDelay: "0.12s" }}
        />
      </svg>
    </div>
  );
}

export function RiftPortal({
  onEnter,
  pending,
}: {
  onEnter: () => void;
  pending?: boolean;
}) {
  return (
    <div className="onboarding-gateway-scene relative mx-auto flex h-[min(72dvh,30rem)] w-full max-w-sm flex-col items-center justify-center">
      <div className="onboarding-gateway-aurora pointer-events-none absolute inset-0" aria-hidden />
      <div className="onboarding-gateway-stars pointer-events-none absolute inset-0" aria-hidden />

      <div className="onboarding-gateway relative flex h-72 w-full max-w-[15rem] flex-col items-center justify-end pb-2 sm:h-80 sm:max-w-[17rem]">
        <div className="onboarding-gateway-arch pointer-events-none absolute inset-x-6 top-4 bottom-16" aria-hidden />
        <div className="onboarding-gateway-shimmer pointer-events-none absolute inset-x-10 top-12 bottom-24" aria-hidden />

        <Image
          src="/sidebet_bird.png"
          alt=""
          width={52}
          height={52}
          className="onboarding-gateway-bird relative z-10 mb-3 h-12 w-12 sm:h-14 sm:w-14"
        />

        <button
          type="button"
          onClick={onEnter}
          className="onboarding-let-me-in relative z-20 rounded-full border border-white/20 bg-white/5 px-8 py-2.5 text-base font-semibold tracking-wide backdrop-blur-sm sm:text-lg"
        >
          {pending ? "Opening…" : "Enter"}
        </button>

        <p className="relative z-10 mt-3 text-center text-[11px] text-muted-foreground/80">
          sidebet.lol or its affiliates are not responsible for financial losses incurred by using the platform.
        </p>
      </div>
    </div>
  );
}
