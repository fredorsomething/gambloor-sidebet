import { prisma } from "@/lib/db";

export type PlatformSettingsDto = {
  allowMarketCreation: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

const DEFAULTS = {
  id: 1,
  allowMarketCreation: false,
} as const;

/** Read singleton platform settings; creates the default row on first access. */
export async function getPlatformSettings(): Promise<PlatformSettingsDto> {
  const row = await prisma.platformSettings.upsert({
    where: { id: DEFAULTS.id },
    update: {},
    create: {
      id: DEFAULTS.id,
      allowMarketCreation: DEFAULTS.allowMarketCreation,
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function updatePlatformSettings(args: {
  allowMarketCreation: boolean;
  updatedBy: string;
}): Promise<PlatformSettingsDto> {
  const row = await prisma.platformSettings.upsert({
    where: { id: DEFAULTS.id },
    update: {
      allowMarketCreation: args.allowMarketCreation,
      updatedBy: args.updatedBy.toLowerCase(),
    },
    create: {
      id: DEFAULTS.id,
      allowMarketCreation: args.allowMarketCreation,
      updatedBy: args.updatedBy.toLowerCase(),
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}
