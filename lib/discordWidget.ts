/** Sidebet Discord server — widget must be enabled in Server Settings → Widget. */
export const DISCORD_GUILD_ID = "1195885743453777982";

export type DiscordWidgetMember = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  avatar_url: string;
  status: "online" | "idle" | "dnd" | "offline" | string;
};

export type DiscordWidget = {
  id: string;
  name: string;
  instant_invite: string | null;
  presence_count: number;
  members: DiscordWidgetMember[];
  channels?: Array<{ id: string; name: string; position: number }>;
};

export function discordWidgetUrl(guildId = DISCORD_GUILD_ID): string {
  return `https://discord.com/api/guilds/${guildId}/widget.json`;
}

export async function fetchDiscordWidget(
  guildId = DISCORD_GUILD_ID,
): Promise<DiscordWidget | null> {
  try {
    const res = await fetch(discordWidgetUrl(guildId), {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as DiscordWidget;
  } catch {
    return null;
  }
}
