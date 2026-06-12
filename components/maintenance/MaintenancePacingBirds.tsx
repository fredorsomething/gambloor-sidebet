import Image from "next/image";

/** Sidebet birds pacing back and forth — reuses onboarding intro animations. */
export function MaintenancePacingBirds() {
  return (
    <div className="maintenance-bird-scene relative mx-auto h-28 w-full max-w-lg overflow-hidden sm:h-32 sm:max-w-xl">
      <div
        className="onboarding-intro-bird-l-move absolute bottom-[12%] z-20"
        style={{ animationDelay: "-2s" }}
      >
        <div className="onboarding-intro-bird-l-flip">
          <div className="onboarding-intro-bird-l-waddle">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={48}
              height={48}
              className="h-10 w-10 sm:h-11 sm:w-11"
              priority
            />
          </div>
        </div>
      </div>

      <div
        className="onboarding-intro-bird-r-move absolute bottom-[28%] z-10 scale-90 opacity-90"
        style={{ animationDelay: "-5s" }}
      >
        <div className="onboarding-intro-bird-r-flip">
          <div className="onboarding-intro-bird-r-waddle">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={40}
              height={40}
              className="h-8 w-8 sm:h-9 sm:w-9"
            />
          </div>
        </div>
      </div>

      <div
        className="onboarding-intro-bird-l-move absolute bottom-[4%] z-30 scale-75 opacity-80"
        style={{ animationDelay: "-7.5s" }}
      >
        <div className="onboarding-intro-bird-l-flip">
          <div className="onboarding-intro-bird-l-waddle">
            <Image
              src="/sidebet_bird.png"
              alt=""
              width={36}
              height={36}
              className="h-7 w-7 sm:h-8 sm:w-8"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
