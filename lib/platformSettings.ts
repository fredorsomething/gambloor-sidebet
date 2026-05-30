import { prisma } from "@/lib/db";

export type PlatformSettingsDto = {
  allowMarketCreation: boolean;
  /** Platform fee on new sidebets (basis points of pool). Admin-controlled. */
  sidebetFeeBps: number;
  updatedAt: string;
  updatedBy: string | null;
};

const DEFAULTS = {
  id: 1,
  allowMarketCreation: false,
  sidebetFeeBps: 0,
} as const;

/** Read singleton platform settings; creates the default row on first access. */
export async function getPlatformSettings(): Promise<PlatformSettingsDto> {
  const row = await prisma.platformSettings.upsert({
    where: { id: DEFAULTS.id },
    update: {},
    create: {
      id: DEFAULTS.id,
      allowMarketCreation: DEFAULTS.allowMarketCreation,
      sidebetFeeBps: DEFAULTS.sidebetFeeBps,
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    sidebetFeeBps: row.sidebetFeeBps,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function updatePlatformSettings(args: {
  allowMarketCreation?: boolean;
  sidebetFeeBps?: number;
  updatedBy: string;
}): Promise<PlatformSettingsDto> {
  const row = await prisma.platformSettings.upsert({
    where: { id: DEFAULTS.id },
    update: {
      ...(args.allowMarketCreation !== undefined
        ? { allowMarketCreation: args.allowMarketCreation }
        : {}),
      ...(args.sidebetFeeBps !== undefined
        ? { sidebetFeeBps: args.sidebetFeeBps }
        : {}),
      updatedBy: args.updatedBy.toLowerCase(),
    },
    create: {
      id: DEFAULTS.id,
      allowMarketCreation: args.allowMarketCreation ?? DEFAULTS.allowMarketCreation,
      sidebetFeeBps: args.sidebetFeeBps ?? DEFAULTS.sidebetFeeBps,
      updatedBy: args.updatedBy.toLowerCase(),
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    sidebetFeeBps: row.sidebetFeeBps,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}
