import { eq, and, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { parties, partyMembers } from "../db/schema";
import { SET_PRICE_YEN } from "../shared/characters";
import { appendEvent } from "./events";

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

export async function listOpenParties(
  db: DrizzleD1Database,
  filter?: { language?: string },
): Promise<BrowsePartyRow[]> {
  // Use raw table-qualified reference to avoid ambiguity in correlated subqueries
  // (character_claims has its own "id" column, so unqualified "id" would be ambiguous)
  const partyIdRef = sql.raw('"parties"."id"');
  const memberCountSq = sql<number>`(SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = ${partyIdRef})`.as("memberCount");
  const claimedCountSq = sql<number>`(SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCount");

  const rows = await db
    .select({
      id: parties.id,
      name: parties.name,
      languages: parties.languages,
      status: parties.status,
      groupChatLink: parties.groupChatLink,
      createdAt: parties.createdAt,
      memberCount: memberCountSq,
      claimedCount: claimedCountSq,
    })
    .from(parties)
    .where(
      filter?.language
        ? and(
            eq(parties.status, "open"),
            sql`EXISTS (SELECT 1 FROM json_each(${parties.languages}) WHERE json_each.value = ${filter.language})`,
          )
        : eq(parties.status, "open"),
    )
    .orderBy(parties.createdAt);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    languages: JSON.parse(r.languages) as string[],
    status: r.status,
    groupChatLink: r.groupChatLink,
    createdAt: r.createdAt,
    memberCount: r.memberCount,
    claimedCount: r.claimedCount,
  }));
}

// ─── Join ──────────────────────────────────────────────────

export type JoinError = "party_locked" | "already_a_member" | "party_not_found";

export interface JoinResult {
  error: JoinError | null;
  eventId?: string;
}

export async function joinParty(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<JoinResult> {
  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.status === "locked") return { error: "party_locked" };

  const existing = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (existing) return { error: "already_a_member" };

  await db.insert(partyMembers).values({
    partyId,
    userId,
    joinedAt: new Date(),
  });

  const eventId = await appendEvent(db, {
    partyId,
    userId,
    type: "member_joined",
    payload: { partyId, userId },
  });

  return { error: null, eventId };
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
