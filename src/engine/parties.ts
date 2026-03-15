import { eq, and, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { parties, partyMembers } from "../db/schema";
import { SET_PRICE_YEN } from "../shared/characters";

// ─── Browse / Filter ───────────────────────────────────────

export interface BrowsePartyRow {
  id: string;
  name: string;
  languages: string[];
  status: string;
  groupChatLink: string | null;
  createdAt: Date;
  memberCount: number;
  claimedCount: number;
}

interface RawBrowseRow {
  id: string;
  name: string;
  languages: string;
  status: string;
  group_chat_link: string | null;
  created_at: number;
  member_count: number;
  claimed_count: number;
}

/** Uses raw D1 for the aggregation subqueries. */
export async function listOpenParties(
  d1: D1Database,
  filter?: { language?: string },
): Promise<BrowsePartyRow[]> {
  let query = `
    SELECT
      p.id, p.name, p.languages, p.status, p.group_chat_link, p.created_at,
      (SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = p.id) AS member_count,
      (SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = p.id AND cc.claim_type = 'claimed') AS claimed_count
    FROM parties p
    WHERE p.status = 'open'
  `;
  const params: string[] = [];

  if (filter?.language) {
    // Match if the filter language appears anywhere in the JSON array
    query += " AND EXISTS (SELECT 1 FROM json_each(p.languages) WHERE json_each.value = ?)";
    params.push(filter.language);
  }

  query += " ORDER BY p.created_at";

  const raw = await d1.prepare(query).bind(...params).all<RawBrowseRow>();

  return raw.results.map((r) => ({
    id: r.id,
    name: r.name,
    languages: JSON.parse(r.languages) as string[],
    status: r.status,
    groupChatLink: r.group_chat_link,
    createdAt: new Date(r.created_at * 1000),
    memberCount: r.member_count,
    claimedCount: r.claimed_count,
  }));
}

// ─── Join ──────────────────────────────────────────────────

export type JoinError = "party_locked" | "already_a_member" | "party_not_found";

export async function joinParty(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<JoinError | null> {
  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return "party_not_found";
  if (party.status === "locked") return "party_locked";

  const existing = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (existing) return "already_a_member";

  await db.insert(partyMembers).values({
    partyId,
    userId,
    joinedAt: new Date(),
  });

  return null;
}

// ─── Multi-party transparency ──────────────────────────────

export async function otherParties(
  db: DrizzleD1Database,
  userId: string,
  currentPartyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ partyId: partyMembers.partyId })
    .from(partyMembers)
    .where(
      and(
        eq(partyMembers.userId, userId),
        ne(partyMembers.partyId, currentPartyId),
      ),
    );
  return rows.map((r) => r.partyId);
}

// ─── Cost split ────────────────────────────────────────────

export function costPerPerson(membersWithClaims: number): number {
  if (membersWithClaims <= 0) return 0;
  return Math.ceil(SET_PRICE_YEN / membersWithClaims);
}

// ─── Deadline / countdown ──────────────────────────────────

const PREORDER_DATE = new Date("2026-05-15T00:00:00+09:00");

export function daysUntilDeadline(now: Date = new Date()): number {
  const diff = PREORDER_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isAutoPromoteDue(
  autoPromoteDate: string | null,
  now: Date = new Date(),
): boolean {
  if (!autoPromoteDate) return false;
  const target = new Date(autoPromoteDate + "T00:00:00+09:00");
  return now >= target;
}

// ─── Party detail helpers ──────────────────────────────────

export async function getPartyWithGroupChatLink(
  db: DrizzleD1Database,
  partyId: string,
): Promise<{ groupChatLink: string | null } | null> {
  const row = await db
    .select({ groupChatLink: parties.groupChatLink })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();
  return row ?? null;
}
