import { SwapPanel } from "@/components/swap/SwapPanel";

export const metadata = {
  title: "Swap",
  description: "Swap USDC.e, pUSD, USDC, and POL on Polygon",
};

export default function SwapPage() {
  return (
    <div className="py-6">
      <SwapPanel />
    </div>
  );
}
