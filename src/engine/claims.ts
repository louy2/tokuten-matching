import type { ClaimType } from "../shared/types";

/** A claim record as stored (DB row or in-memory for tests). */
export interface Claim {
  id: string;
  partyId: string;
  characterId: number;
  userId: string;
  claimType: ClaimType;
  rank: number | null;
  createdAt: Date;
}

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
  /** user who holds the "claimed" (only when state === "claimed") */
  claimedBy: string | null;
  /** users who hold a "conditional" */
  conditionalBy: string[];
  /** users who expressed a "preference", ordered by rank */
  preferences: { userId: string; rank: number }[];
}

// ─── Queries ───────────────────────────────────────────────

/** Derive the slot state for every character (1-12) given a list of claims. */
export function resolveSlots(claims: Claim[]): CharacterSlot[] {
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
 * Validate whether a new claim can be placed.
 * Returns null if valid, or an error string if not.
 */
export function validateClaim(
  newClaim: { userId: string; characterId: number; claimType: ClaimType },
  existingClaims: Claim[],
  partyMembers: string[],
  partyStatus: "open" | "locked",
): ClaimError | null {
  if (partyStatus === "locked") return "party_locked";
  if (!partyMembers.includes(newClaim.userId)) return "not_a_member";
  if (newClaim.characterId < 1 || newClaim.characterId > 12)
    return "invalid_character";

  const forChar = existingClaims.filter(
    (c) => c.characterId === newClaim.characterId,
  );

  if (newClaim.claimType === "claimed") {
    // Rule: one "claimed" per character per party
    if (forChar.some((c) => c.claimType === "claimed"))
      return "character_already_claimed";
    // Rule: a user can claim at most 1 character per party as "claimed"
    if (
      existingClaims.some(
        (c) => c.userId === newClaim.userId && c.claimType === "claimed",
      )
    )
      return "user_already_claimed_another";
  }

  if (newClaim.claimType === "conditional") {
    // Rule: one "conditional" per character per party
    if (forChar.some((c) => c.claimType === "conditional"))
      return "character_already_has_conditional";
    // Prevent same user from double-conditional on same character
    if (
      forChar.some(
        (c) =>
          c.userId === newClaim.userId && c.claimType === "conditional",
      )
    )
      return "user_already_conditional_this_character";
  }

  // "preference" — no uniqueness constraints (anyone can want anyone)
  return null;
}

/**
 * When a "claimed" displaces an existing "conditional" on the same character,
 * return the claim IDs that should be removed.
 */
export function findDisplacedClaims(
  characterId: number,
  claimType: ClaimType,
  existingClaims: Claim[],
): string[] {
  if (claimType !== "claimed") return [];
  return existingClaims
    .filter(
      (c) => c.characterId === characterId && c.claimType === "conditional",
    )
    .map((c) => c.id);
}

// ─── Auto-promote ──────────────────────────────────────────

/**
 * Auto-promote: for each character that has exactly one conditional and no
 * "claimed", promote that conditional to "claimed".
 * Returns the claim IDs to promote.
 */
export function findAutoPromotable(claims: Claim[]): string[] {
  const toPromote: string[] = [];
  for (let charId = 1; charId <= 12; charId++) {
    const forChar = claims.filter((c) => c.characterId === charId);
    const hasClaimed = forChar.some((c) => c.claimType === "claimed");
    const conditionals = forChar.filter((c) => c.claimType === "conditional");
    if (!hasClaimed && conditionals.length === 1) {
      toPromote.push(conditionals[0].id);
    }
  }
  return toPromote;
}
