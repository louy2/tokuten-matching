import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { characterClaims, parties, partyMembers } from "../db/schema";
import type { ClaimType } from "../shared/types";
import { buildEventInsert } from "./events";

/**
 * The resolved state of a single character slot within a party.
 *
 *   OPEN        – no conditional or claimed; may have preferences
 *   CONDITIONAL – exactly one conditional claim
 *   CONTESTED   – 2+ conditional claims (needs discussion)
 *   CLAIMED     – someone has a full "claimed" on this character
 */
export type CharacterSlotState =
  | "open"
  | "wanted"
  | "conditional"
  | "contested"
  | "claimed";

export interface CharacterSlot {
  characterId: number;
  state: CharacterSlotState;
  claimedBy: string | null;
  conditionalBy: string[];
  preferences: { userId: string; rank: number }[];
}

// ─── Queries ───────────────────────────────────────────────

/** Load all claims for a party and resolve every character slot (1-12). */
export async function resolveSlots(
  db: DrizzleD1Database,
  partyId: string,
): Promise<CharacterSlot[]> {
  const claims = await db
    .select()
    .from(characterClaims)
    .where(eq(characterClaims.partyId, partyId));

  const slots: CharacterSlot[] = [];
  for (let id = 1; id <= 12; id++) {
    const forChar = claims.filter((c) => c.characterId === id);

    const claimed = forChar.find((c) => c.claimType === "claimed");
    const conditionals = forChar.filter((c) => c.claimType === "conditional");
    const preferences = forChar
      .filter((c) => c.claimType === "preference")
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((c) => ({ userId: c.userId, rank: c.rank ?? 99 }));

    let state: CharacterSlotState;
    if (claimed) {
      state = "claimed";
    } else if (conditionals.length >= 2) {
      state = "contested";
    } else if (conditionals.length === 1) {
      state = "conditional";
    } else if (preferences.length > 0) {
      state = "wanted";
    } else {
      state = "open";
    }

    slots.push({
      characterId: id,
      state,
      claimedBy: claimed?.userId ?? null,
      conditionalBy: conditionals.map((c) => c.userId),
      preferences,
    });
  }
  return slots;
}

// ─── Validation ────────────────────────────────────────────

export type ClaimError =
  | "character_already_claimed"
  | "user_already_conditional_this_character"
  | "user_already_prefers_this_character"
  | "user_already_has_full_claim"
  | "party_locked"
  | "not_a_member"
  | "invalid_character"
  | "claim_not_found"
  | "not_claim_owner"
  | "invalid_rank";

/**
 * Validate whether a new claim can be placed, reading current state from D1.
 * Returns null if valid, or an error string if not.
 */
export async function validateClaim(
  db: DrizzleD1Database,
  partyId: string,
  newClaim: { userId: string; characterId: number; claimType: ClaimType; rank?: number | null },
): Promise<ClaimError | null> {
  if (newClaim.characterId < 1 || newClaim.characterId > 12)
    return "invalid_character";

  // Check party status
  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();
  if (party?.status === "locked") return "party_locked";

  // Check membership
  const membership = await db
    .select()
    .from(partyMembers)
    .where(
      and(
        eq(partyMembers.partyId, partyId),
        eq(partyMembers.userId, newClaim.userId),
      ),
    )
    .get();
  if (!membership) return "not_a_member";

  // Load existing claims for this party
  const existingClaims = await db
    .select()
    .from(characterClaims)
    .where(eq(characterClaims.partyId, partyId));

  const forChar = existingClaims.filter(
    (c) => c.characterId === newClaim.characterId,
  );

  if (newClaim.claimType === "claimed") {
    if (forChar.some((c) => c.claimType === "claimed"))
      return "character_already_claimed";
    // Per-user limit: max 1 full claim per user per party
    if (existingClaims.some(
      (c) => c.userId === newClaim.userId && c.claimType === "claimed",
    ))
      return "user_already_has_full_claim";
  }

  if (newClaim.claimType === "preference") {
    if (newClaim.rank != null && newClaim.rank < 1)
      return "invalid_rank";
    if (
      forChar.some(
        (c) =>
          c.userId === newClaim.userId && c.claimType === "preference",
      )
    )
      return "user_already_prefers_this_character";
  }

  if (newClaim.claimType === "conditional") {
    if (forChar.some((c) => c.claimType === "claimed"))
      return "character_already_claimed";
    // Same user can't place two conditionals on same character,
    // but different users CAN → produces "contested" state
    if (
      forChar.some(
        (c) =>
          c.userId === newClaim.userId && c.claimType === "conditional",
      )
    )
      return "user_already_conditional_this_character";
  }

  return null;
}

// ─── Mutations ─────────────────────────────────────────────

export interface PlaceClaimResult {
  claimId: string;
  eventIds: string[];
}

/**
 * Place a claim after validation. Displaces conditionals when a full claim
 * is placed. All materialized writes and event appends are batched atomically.
 */
export async function placeClaim(
  db: DrizzleD1Database,
  partyId: string,
  claim: { id: string; userId: string; characterId: number; claimType: ClaimType; rank: number | null },
): Promise<PlaceClaimResult> {
  const eventIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writes: any[] = [];

  // If full-claiming, find and displace any conditional on this character
  if (claim.claimType === "claimed") {
    const displaced = await db
      .select()
      .from(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.characterId, claim.characterId),
          eq(characterClaims.claimType, "conditional"),
        ),
      );

    for (const d of displaced) {
      writes.push(db.delete(characterClaims).where(eq(characterClaims.id, d.id)));
      const ev = buildEventInsert(db, {
        partyId,
        userId: claim.userId,
        type: "claim_displaced",
        payload: {
          displacedClaimId: d.id,
          displacedUserId: d.userId,
          characterId: claim.characterId,
          byUserId: claim.userId,
        },
      });
      writes.push(ev.query);
      eventIds.push(ev.id);
    }
  }

  writes.push(
    db.insert(characterClaims).values({
      id: claim.id,
      partyId,
      characterId: claim.characterId,
      userId: claim.userId,
      claimType: claim.claimType,
      rank: claim.rank,
      createdAt: new Date(),
    }),
  );

  const ev = buildEventInsert(db, {
    partyId,
    userId: claim.userId,
    type: "claim_placed",
    payload: {
      claimId: claim.id,
      characterId: claim.characterId,
      claimType: claim.claimType,
      rank: claim.rank,
    },
  });
  writes.push(ev.query);
  eventIds.push(ev.id);

  await db.batch(writes as [typeof writes[0], ...typeof writes]);

  return { claimId: claim.id, eventIds };
}

export interface AutoPromoteResult {
  promotedCount: number;
  eventIds: string[];
}

/**
 * Auto-promote: for each character with exactly one conditional and no
 * "claimed", promote that conditional to "claimed".
 * All promotions and events are batched atomically.
 */
export async function autoPromote(
  db: DrizzleD1Database,
  partyId: string,
): Promise<AutoPromoteResult> {
  const claims = await db
    .select()
    .from(characterClaims)
    .where(eq(characterClaims.partyId, partyId));

  const toPromote: { id: string; userId: string; characterId: number }[] = [];
  for (let charId = 1; charId <= 12; charId++) {
    const forChar = claims.filter((c) => c.characterId === charId);
    const hasClaimed = forChar.some((c) => c.claimType === "claimed");
    const conditionals = forChar.filter((c) => c.claimType === "conditional");
    if (!hasClaimed && conditionals.length === 1) {
      toPromote.push({
        id: conditionals[0].id,
        userId: conditionals[0].userId,
        characterId: charId,
      });
    }
  }

  if (toPromote.length === 0) {
    return { promotedCount: 0, eventIds: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writes: any[] = [];
  const eventIds: string[] = [];

  for (const claim of toPromote) {
    writes.push(
      db
        .update(characterClaims)
        .set({ claimType: "claimed" })
        .where(eq(characterClaims.id, claim.id)),
    );

    const ev = buildEventInsert(db, {
      partyId,
      userId: claim.userId,
      type: "claim_promoted",
      payload: {
        claimId: claim.id,
        characterId: claim.characterId,
        userId: claim.userId,
      },
    });
    writes.push(ev.query);
    eventIds.push(ev.id);
  }

  await db.batch(writes as [typeof writes[0], ...typeof writes]);

  return { promotedCount: toPromote.length, eventIds };
}

// ─── Cancel ──────────────────────────────────────────────

export type CancelClaimError = "claim_not_found" | "not_claim_owner" | "party_locked" | "not_a_member";

/**
 * Cancel a conditional or full claim. Only the claim owner can cancel.
 * Deletion and event append are batched atomically.
 */
export async function cancelClaim(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
  characterId: number,
  claimType: "conditional" | "claimed",
): Promise<{ eventId: string } | { error: CancelClaimError }> {
  // Read phase: validate
  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();
  if (party?.status === "locked") return { error: "party_locked" };

  const membership = await db
    .select()
    .from(partyMembers)
    .where(
      and(
        eq(partyMembers.partyId, partyId),
        eq(partyMembers.userId, userId),
      ),
    )
    .get();
  if (!membership) return { error: "not_a_member" };

  const claim = await db
    .select()
    .from(characterClaims)
    .where(
      and(
        eq(characterClaims.partyId, partyId),
        eq(characterClaims.characterId, characterId),
        eq(characterClaims.userId, userId),
        eq(characterClaims.claimType, claimType),
      ),
    )
    .get();

  if (!claim) return { error: "claim_not_found" };

  // Write phase: delete claim + append event atomically
  const ev = buildEventInsert(db, {
    partyId,
    userId,
    type: "claim_cancelled",
    payload: {
      claimId: claim.id,
      characterId,
      claimType,
    },
  });

  await db.batch([
    db.delete(characterClaims).where(eq(characterClaims.id, claim.id)),
    ev.query,
  ]);

  return { eventId: ev.id };
}
