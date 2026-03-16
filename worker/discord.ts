/** Discord Bot API helpers */

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Open a DM channel with a Discord user and send a message.
 * Requires a bot token and the user's Discord ID (oauth_id).
 */
export async function sendDiscordDM(
  botToken: string,
  discordUserId: string,
  content: string,
): Promise<boolean> {
  // Step 1: Open a DM channel
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) return false;

  const channel = (await channelRes.json()) as { id: string };

  // Step 2: Send the message
  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return msgRes.ok;
}
