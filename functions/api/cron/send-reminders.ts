import type { Env } from "../_auth";
import { sendDiscordDM } from "../_discord";

/** Reminder milestones in days before auto-promote date */
const REMINDER_DAYS = [30, 14, 3, 0];

interface PartyRow {
  id: string;
  name: string;
  auto_promote_date: string;
  leader_id: string;
}

interface LeaderRow {
  oauth_provider: string;
  oauth_id: string;
  display_name: string;
}

interface SlotCount {
  open_count: number;
  contested_count: number;
  claimed_count: number;
}

/**
 * POST /api/cron/send-reminders
 *
 * Protected by CRON_SECRET bearer token.
 * Checks all open parties and sends DM reminders to Discord leaders
 * at milestone days before their auto-promote date.
 *
 * Call this daily via an external scheduler (e.g., Cloudflare Worker cron,
 * GitHub Actions, or any cron service).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Verify cron secret
  const auth = context.request.headers.get("Authorization");
  if (auth !== `Bearer ${context.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { DB, SESSIONS, DISCORD_BOT_TOKEN } = context.env;

  // Get all open parties with an auto-promote date
  const parties = await DB.prepare(
    "SELECT id, name, auto_promote_date, leader_id FROM parties WHERE status = 'open' AND auto_promote_date IS NOT NULL",
  ).all<PartyRow>();

  let sent = 0;
  let skipped = 0;

  for (const party of parties.results) {
    const targetDate = new Date(party.auto_promote_date + "T00:00:00+09:00");
    const diffMs = targetDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Check if today matches a reminder milestone
    const milestone = REMINDER_DAYS.find((d) => d === daysUntil);
    if (milestone === undefined) continue;

    // Deduplicate: check KV to see if this reminder was already sent
    const kvKey = `reminder:${party.id}:${milestone}`;
    const alreadySent = await SESSIONS.get(kvKey);
    if (alreadySent) {
      skipped++;
      continue;
    }

    // Get leader info
    const leader = await DB.prepare(
      "SELECT oauth_provider, oauth_id, display_name FROM users WHERE id = ?",
    )
      .bind(party.leader_id)
      .first<LeaderRow>();

    if (!leader || leader.oauth_provider !== "discord") {
      skipped++;
      continue;
    }

    // Get party slot stats for context
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
      .first<SlotCount>();

    const openCount = stats?.open_count ?? 12;
    const contestedCount = stats?.contested_count ?? 0;
    const claimedCount = stats?.claimed_count ?? 0;

    // Build the reminder message
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
      // Mark as sent — expire after 60 days so KV doesn't grow forever
      await SESSIONS.put(kvKey, "1", { expirationTtl: 60 * 60 * 24 * 60 });
      sent++;
    } else {
      skipped++;
    }
  }

  return Response.json({ sent, skipped, total: parties.results.length });
};
