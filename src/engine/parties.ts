import { eq, and, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { parties, partyMembers } from "../db/schema";
import { SET_PRICE_YEN } from "../shared/characters";
import { buildEventInsert } from "./events";

// ─── Create ───────────────────────────────────────────────

export interface CreatePartyInput {
  name: string;
  description?: string | null;
  leaderId: string;
  languages: string[];
  groupChatLink?: string | null;
  autoPromoteDate?: string;
}

export interface CreatePartyResult {
  partyId: string;
  eventIds: string[];
}

/**
 * Create a party and add the leader as first member.
 * Party insert + member insert + events are batched atomically.
 */
export async function createParty(
  db: DrizzleD1Database,
  input: CreatePartyInput,
): Promise<CreatePartyResult> {
  const partyId = crypto.randomUUID();
  const now = new Date();

  const ev1 = buildEventInsert(db, {
    partyId,
    userId: input.leaderId,
    type: "party_created",
    payload: {
      partyId,
      name: input.name,
      description: input.description ?? null,
      leaderId: input.leaderId,
      languages: input.languages,
      groupChatLink: input.groupChatLink ?? null,
      autoPromoteDate: input.autoPromoteDate ?? "2026-05-08",
    },
  });

  const ev2 = buildEventInsert(db, {
    partyId,
    userId: input.leaderId,
    type: "member_joined",
    payload: { partyId, userId: input.leaderId },
  });

  await db.batch([
    db.insert(parties).values({
      id: partyId,
      name: input.name,
      description: input.description ?? null,
      leaderId: input.leaderId,
      status: "open",
      groupChatLink: input.groupChatLink ?? null,
      languages: JSON.stringify(input.languages),
      autoPromoteDate: input.autoPromoteDate ?? "2026-05-08",
      createdAt: now,
    }),
    ev1.query,
    db.insert(partyMembers).values({
      partyId,
      userId: input.leaderId,
      joinedAt: now,
    }),
    ev2.query,
  ]);

  return { partyId, eventIds: [ev1.id, ev2.id] };
}

// ─── Lock ─────────────────────────────────────────────────

export type LockError = "party_not_found" | "already_locked" | "not_leader";

/**
 * Lock a party (prevent new joins and claims).
 * Status update + event are batched atomically.
 */
export async function lockParty(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<{ eventId: string } | { error: LockError }> {
  const party = await db
    .select({ status: parties.status, leaderId: parties.leaderId })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.status === "locked") return { error: "already_locked" };
  if (party.leaderId !== userId) return { error: "not_leader" };

  const ev = buildEventInsert(db, {
    partyId,
    userId,
    type: "party_locked",
    payload: { partyId },
  });

  await db.batch([
    db.update(parties).set({ status: "locked" }).where(eq(parties.id, partyId)),
    ev.query,
  ]);

  return { eventId: ev.id };
}

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

export type JoinError = "party_locked" | "already_a_member" | "party_not_found" | "party_full";

export interface JoinResult {
  error: JoinError | null;
  eventId?: string;
}

export async function joinParty(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<JoinResult> {
  // Read phase: validate
  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.status === "locked") return { error: "party_locked" };

  // Check member count limit (max 12 per Alloy model PartySizeBound)
  const memberCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(partyMembers)
    .where(eq(partyMembers.partyId, partyId))
    .get();
  if (memberCount && memberCount.count >= 12) return { error: "party_full" };

  const existing = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (existing) return { error: "already_a_member" };

  // Write phase: member insert + event batched atomically
  const ev = buildEventInsert(db, {
    partyId,
    userId,
    type: "member_joined",
    payload: { partyId, userId },
  });

  await db.batch([
    db.insert(partyMembers).values({
      partyId,
      userId,
      joinedAt: new Date(),
    }),
    ev.query,
  ]);

  return { error: null, eventId: ev.id };
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

// ─── Per-card cost split ──────────────────────────────────

export function costPerCard(setPrice: number): number {
  if (setPrice <= 0) return 0;
  return Math.ceil(setPrice / 12);
}

export interface CostBreakdownMember {
  userId: string;
  count: number;
  cost: number;
}

export interface CostBreakdownResult {
  pricePerCard: number;
  members: CostBreakdownMember[];
  claimedTotal: number;
  unallocated: number;
}

export function costBreakdown(
  setPrice: number,
  claims: { userId: string; count: number }[],
): CostBreakdownResult {
  const perCard = costPerCard(setPrice);
  const members = claims.map((c) => ({
    userId: c.userId,
    count: c.count,
    cost: c.count * perCard,
  }));
  const claimedTotal = members.reduce((sum, m) => sum + m.cost, 0);
  return {
    pricePerCard: perCard,
    members,
    claimedTotal,
    unallocated: setPrice - claimedTotal,
  };
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

// ─── Mituori board claim ──────────────────────────────────

export type MituoriBoardClaimError =
  | "party_not_found"
  | "not_a_member"
  | "party_locked"
  | "already_claimed";

export async function claimMituoriBoard(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<{ eventId: string } | { error: MituoriBoardClaimError }> {
  const party = await db
    .select({
      status: parties.status,
      mituoriBoardClaimedBy: parties.mituoriBoardClaimedBy,
    })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.status === "locked") return { error: "party_locked" };
  if (party.mituoriBoardClaimedBy) return { error: "already_claimed" };

  const membership = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (!membership) return { error: "not_a_member" };

  const ev = buildEventInsert(db, {
    partyId,
    userId,
    type: "mituori_board_claimed",
    payload: { partyId, userId },
  });

  await db.batch([
    db
      .update(parties)
      .set({ mituoriBoardClaimedBy: userId })
      .where(eq(parties.id, partyId)),
    ev.query,
  ]);

  return { eventId: ev.id };
}

export type MituoriBoardUnclaimError =
  | "party_not_found"
  | "not_a_member"
  | "party_locked"
  | "not_board_claimer";

export async function unclaimMituoriBoard(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<{ eventId: string } | { error: MituoriBoardUnclaimError }> {
  const party = await db
    .select({
      status: parties.status,
      mituoriBoardClaimedBy: parties.mituoriBoardClaimedBy,
    })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.status === "locked") return { error: "party_locked" };
  if (party.mituoriBoardClaimedBy !== userId) return { error: "not_board_claimer" };

  const membership = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (!membership) return { error: "not_a_member" };

  const ev = buildEventInsert(db, {
    partyId,
    userId,
    type: "mituori_board_unclaimed",
    payload: { partyId, userId },
  });

  await db.batch([
    db
      .update(parties)
      .set({ mituoriBoardClaimedBy: null })
      .where(eq(parties.id, partyId)),
    ev.query,
  ]);

  return { eventId: ev.id };
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
