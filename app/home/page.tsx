import { Feed } from "@/components/Feed";
import { HomePageLayout } from "@/components/home/HomePageLayout";
import { getPlatformStats } from "@/lib/platformStats";

export const revalidate = 60;

export default async function HomePage() {
  const { totalVolumeUsd, userCount } = await getPlatformStats();

  return (
    <HomePageLayout
      totalVolumeUsd={totalVolumeUsd}
      userCount={userCount}
      feed={<Feed />}
    />
  );
}
