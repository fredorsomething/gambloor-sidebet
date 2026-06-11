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
        <h1 className="text-2xl font-semibold">
          {settings.allowMarketCreation ? "Create a bet" : "Propose a sidebet"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {settings.allowMarketCreation
            ? "Pick your format, fill in the details, and you're live."
            : "Settle an argument with a friend — pick a side, set the stakes, share the link."}
        </p>
      </div>
      <CreateChooser defaultType={defaultType} />
    </div>
  );
}
