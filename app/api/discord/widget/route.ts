import { fetchDiscordWidget } from "@/lib/discordWidget";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const revalidate = 60;

/** GET /api/discord/widget — proxy Discord server widget JSON for the site embed. */
export async function GET() {
  const widget = await fetchDiscordWidget();
  if (!widget) {
    return jsonErr("discord widget unavailable", 502);
  }
  return jsonOk(widget);
}
