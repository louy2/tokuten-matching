import { eq, and, isNotNull, sql } from "drizzle-orm";
import type { Env } from "./env";
import { getDb } from "./db";
import { sendDiscordDM } from "./discord";
import { parties, users } from "../src/db/schema";

export const REMINDER_DAYS = [30, 14, 3, 0];

export async function sendReminders(env: Env): Promise<{ sent: number; skipped: number; total: number }> {
  const now = new Date();
  const db = getDb(env.DB);

  const openParties = await db
    .select({
      id: parties.id,
      name: parties.name,
      autoPromoteDate: parties.autoPromoteDate,
      leaderId: parties.leaderId,
    })
    .from(parties)
    .where(and(eq(parties.status, "open"), isNotNull(parties.autoPromoteDate)));

  let sent = 0;
  let skipped = 0;

  for (const party of openParties) {
    const targetDate = new Date(party.autoPromoteDate! + "T00:00:00+09:00");
    const diffMs = targetDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const milestone = REMINDER_DAYS.find((d) => d === daysUntil);
    if (milestone === undefined) continue;

    const kvKey = `reminder:${party.id}:${milestone}`;
    const alreadySent = await env.SESSIONS.get(kvKey);
    if (alreadySent) {
      skipped++;
      continue;
    }

    const leader = await db
      .select({
        oauthProvider: users.oauthProvider,
        oauthId: users.oauthId,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, party.leaderId))
      .get();

    if (!leader || leader.oauthProvider !== "discord") {
      skipped++;
      continue;
    }

    // Complex aggregation query — use Drizzle's sql template
    const stats = await db.get<{
      openCount: number;
      contestedCount: number;
      claimedCount: number;
    }>(sql`
      SELECT
        SUM(CASE WHEN sub.state = 'open' THEN 1 ELSE 0 END) AS openCount,
        SUM(CASE WHEN sub.state = 'contested' THEN 1 ELSE 0 END) AS contestedCount,
        SUM(CASE WHEN sub.state = 'claimed' THEN 1 ELSE 0 END) AS claimedCount
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
        WHERE cc.party_id = ${party.id}
        GROUP BY cc.character_id
      ) sub
    `);

    const openCount = stats?.openCount ?? 12;
    const contestedCount = stats?.contestedCount ?? 0;
    const claimedCount = stats?.claimedCount ?? 0;

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

    const ok = await sendDiscordDM(env.DISCORD_BOT_TOKEN, leader.oauthId, message);
    if (ok) {
      await env.SESSIONS.put(kvKey, "1", { expirationTtl: 60 * 60 * 24 * 60 });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped, total: openParties.length };
}
