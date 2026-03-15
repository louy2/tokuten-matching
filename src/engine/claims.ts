import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { characterClaims, parties, partyMembers } from "../db/schema";
import type { ClaimType } from "../shared/types";

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
  | "user_already_claimed_another"
  | "character_already_has_conditional"
  | "user_already_conditional_this_character"
  | "party_locked"
  | "not_a_member"
  | "invalid_character";

/**
 * Validate whether a new claim can be placed, reading current state from D1.
 * Returns null if valid, or an error string if not.
 */
export async function validateClaim(
  db: DrizzleD1Database,
  partyId: string,
  newClaim: { userId: string; characterId: number; claimType: ClaimType },
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
    if (
      existingClaims.some(
        (c) => c.userId === newClaim.userId && c.claimType === "claimed",
      )
    )
      return "user_already_claimed_another";
  }

  if (newClaim.claimType === "conditional") {
    if (forChar.some((c) => c.claimType === "conditional"))
      return "character_already_has_conditional";
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

/**
 * Place a claim after validation. Displaces conditionals when a full claim
 * is placed. Returns the new claim ID.
 */
export async function placeClaim(
  db: DrizzleD1Database,
  partyId: string,
  claim: { id: string; userId: string; characterId: number; claimType: ClaimType; rank: number | null },
): Promise<string> {
  // If full-claiming, displace any conditional on this character
  if (claim.claimType === "claimed") {
    await db
      .delete(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.characterId, claim.characterId),
          eq(characterClaims.claimType, "conditional"),
        ),
      );
  }

  await db.insert(characterClaims).values({
    id: claim.id,
    partyId,
    characterId: claim.characterId,
    userId: claim.userId,
    claimType: claim.claimType,
    rank: claim.rank,
    createdAt: new Date(),
  });

  return claim.id;
}

/**
 * Auto-promote: for each character with exactly one conditional and no
 * "claimed", promote that conditional to "claimed".
 * Returns the count of promoted claims.
 */
export async function autoPromote(
  db: DrizzleD1Database,
  partyId: string,
): Promise<number> {
  const claims = await db
    .select()
    .from(characterClaims)
    .where(eq(characterClaims.partyId, partyId));

  const toPromote: string[] = [];
  for (let charId = 1; charId <= 12; charId++) {
    const forChar = claims.filter((c) => c.characterId === charId);
    const hasClaimed = forChar.some((c) => c.claimType === "claimed");
    const conditionals = forChar.filter((c) => c.claimType === "conditional");
    if (!hasClaimed && conditionals.length === 1) {
      toPromote.push(conditionals[0].id);
    }
  }

  for (const claimId of toPromote) {
    await db
      .update(characterClaims)
      .set({ claimType: "claimed" })
      .where(eq(characterClaims.id, claimId));
  }

  return toPromote.length;
}
