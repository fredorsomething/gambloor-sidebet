import { CreateChooser } from "@/components/CreateChooser";
import { getPlatformSettings } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const settings = await getPlatformSettings();
  const wantMarket = searchParams.type === "market";
  const defaultType =
    wantMarket && settings.allowMarketCreation ? "market" : "sidebet";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create a bet</h1>
        <p className="text-sm text-muted-foreground">
          {settings.allowMarketCreation
            ? "Choose how you want to run it — a 1v1 sidebet or a public market."
            : "Propose a 1v1 sidebet. Public prediction markets are paused while we finish the order book."}
        </p>
      </div>
      <CreateChooser defaultType={defaultType} />
    </div>
  );
}
