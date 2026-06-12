import { prisma } from "@/lib/db";

export type PlatformSettingsDto = {
  allowMarketCreation: boolean;
  /** Platform fee on new sidebets (basis points of pool). Admin-controlled. */
  sidebetFeeBps: number;
  maintenanceMode: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

const DEFAULTS = {
  id: 1,
  allowMarketCreation: false,
  sidebetFeeBps: 0,
  maintenanceMode: false,
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
      maintenanceMode: DEFAULTS.maintenanceMode,
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    sidebetFeeBps: row.sidebetFeeBps,
    maintenanceMode: row.maintenanceMode,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function updatePlatformSettings(args: {
  allowMarketCreation?: boolean;
  sidebetFeeBps?: number;
  maintenanceMode?: boolean;
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
      ...(args.maintenanceMode !== undefined
        ? { maintenanceMode: args.maintenanceMode }
        : {}),
      updatedBy: args.updatedBy.toLowerCase(),
    },
    create: {
      id: DEFAULTS.id,
      allowMarketCreation: args.allowMarketCreation ?? DEFAULTS.allowMarketCreation,
      sidebetFeeBps: args.sidebetFeeBps ?? DEFAULTS.sidebetFeeBps,
      maintenanceMode: args.maintenanceMode ?? DEFAULTS.maintenanceMode,
      updatedBy: args.updatedBy.toLowerCase(),
    },
  });
  return {
    allowMarketCreation: row.allowMarketCreation,
    sidebetFeeBps: row.sidebetFeeBps,
    maintenanceMode: row.maintenanceMode,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}
