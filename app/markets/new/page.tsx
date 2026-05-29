import { ChainGuard } from "@/components/ChainGuard";
import { CreateMarketForm } from "@/components/markets/CreateMarketForm";

export default function NewMarketPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create a market</h1>
        <p className="text-sm text-muted-foreground">
          Define the outcomes and a settler. A condition is prepared on-chain so
          anyone can mint and trade outcome shares through the order book.
        </p>
      </div>
      <ChainGuard require="market">
        <CreateMarketForm />
      </ChainGuard>
    </div>
  );
}
