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
          {settings.allowMarketCreation ? "Create a bet" : "Create a sidebet"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {settings.allowMarketCreation
            ? "Pick your format, fill in the details, and you're live."
            : "Write your rules, pick a side, set the stakes and share the link."}
        </p>
      </div>
      <CreateChooser defaultType={defaultType} />
    </div>
  );
}
