import { redirect } from "next/navigation";

import { getPlatformSettings } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";

export default async function NewMarketPage() {
  const settings = await getPlatformSettings();
  if (!settings.allowMarketCreation) {
    redirect("/create");
  }
  redirect("/create?type=market");
}
