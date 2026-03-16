import type { Env } from "./env";
import { sendDiscordDM } from "./discord";

export const REMINDER_DAYS = [30, 14, 3, 0];

export async function sendReminders(env: Env): Promise<{ sent: number; skipped: number; total: number }> {
  const now = new Date();
  const { DB, SESSIONS, DISCORD_BOT_TOKEN } = env;

  const parties = await DB.prepare(
    "SELECT id, name, auto_promote_date, leader_id FROM parties WHERE status = 'open' AND auto_promote_date IS NOT NULL",
  ).all<{ id: string; name: string; auto_promote_date: string; leader_id: string }>();

  let sent = 0;
  let skipped = 0;

  for (const party of parties.results) {
    const targetDate = new Date(party.auto_promote_date + "T00:00:00+09:00");
    const diffMs = targetDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const milestone = REMINDER_DAYS.find((d) => d === daysUntil);
    if (milestone === undefined) continue;

    const kvKey = `reminder:${party.id}:${milestone}`;
    const alreadySent = await SESSIONS.get(kvKey);
    if (alreadySent) {
      skipped++;
      continue;
    }

    const leader = await DB.prepare(
      "SELECT oauth_provider, oauth_id, display_name FROM users WHERE id = ?",
    )
      .bind(party.leader_id)
      .first<{ oauth_provider: string; oauth_id: string; display_name: string }>();

    if (!leader || leader.oauth_provider !== "discord") {
      skipped++;
      continue;
    }

    const stats = await DB.prepare(`
      SELECT
        SUM(CASE WHEN sub.state = 'open' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN sub.state = 'contested' THEN 1 ELSE 0 END) AS contested_count,
        SUM(CASE WHEN sub.state = 'claimed' THEN 1 ELSE 0 END) AS claimed_count
      FROM (
        SELECT
          cc.character_id,
          CASE
            WHEN SUM(CASE WHEN cc.claim_type = 'claimed' THEN 1 ELSE 0 END) > 0 THEN 'claimed'
            WHEN SUM(CASE WHEN cc.claim_type = 'conditional' THEN 1 ELSE 0 END) >= 2 THEN 'contested'
            WHEN SUM(CASE WHEN cc.claim_type = 'conditional' THEN 1 ELSE 0 END) = 1 THEN 'conditional'
            ELSE 'open'
          END AS state
        FROM character_claims cc
        WHERE cc.party_id = ?
        GROUP BY cc.character_id
      ) sub
    `)
      .bind(party.id)
      .first<{ open_count: number; contested_count: number; claimed_count: number }>();

    const openCount = stats?.open_count ?? 12;
    const contestedCount = stats?.contested_count ?? 0;
    const claimedCount = stats?.claimed_count ?? 0;

    let message: string;
    if (daysUntil === 0) {
      message =
        `🔔 **Auto-promote day for "${party.name}"!**\n` +
        `Uncontested conditional claims will be promoted to full claims today.\n` +
        `Status: ${claimedCount} claimed, ${contestedCount} contested, ${openCount} open out of 12 slots.`;
    } else {
      message =
        `🔔 **Reminder: ${daysUntil} day${daysUntil !== 1 ? "s" : ""} until auto-promote for "${party.name}"**\n` +
        `Status: ${claimedCount} claimed, ${contestedCount} contested, ${openCount} open out of 12 slots.\n` +
        (contestedCount > 0
          ? `⚠️ ${contestedCount} contested slot${contestedCount !== 1 ? "s" : ""} still need to be resolved!`
          : "All slots are looking good!");
    }

    const ok = await sendDiscordDM(DISCORD_BOT_TOKEN, leader.oauth_id, message);
    if (ok) {
      await SESSIONS.put(kvKey, "1", { expirationTtl: 60 * 60 * 24 * 60 });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped, total: parties.results.length };
}
