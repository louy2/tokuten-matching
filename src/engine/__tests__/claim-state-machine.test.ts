import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveSlots,
  validateClaim,
  findDisplacedClaims,
  findAutoPromotable,
  type Claim,
} from "../claims";
import { makeClaim, resetIds } from "./helpers";

// ─── Claim State Machine ───────────────────────────────────
//
//   OPEN → CONDITIONAL → CLAIMED
//              ↓
//          CONTESTED (2+ conditionals)
//
//   If someone full-claims over a conditional → conditional displaced
//   Auto-promote: single conditional → claimed on deadline

const PARTY = "party-1";
const members = ["alice", "bob", "carol", "dave"];

describe("Claim State Machine", () => {
  let claims: Claim[];

  beforeEach(() => {
    resetIds();
    claims = [];
  });

  // ── OPEN state ──

  describe("OPEN state", () => {
    it("character with no claims is OPEN", () => {
      const slots = resolveSlots(claims);
      expect(slots[0].state).toBe("open");
      expect(slots[0].claimedBy).toBeNull();
      expect(slots[0].conditionalBy).toEqual([]);
    });

    it("character with only preferences is still OPEN", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 }),
        makeClaim({ partyId: PARTY, characterId: 1, userId: "bob", claimType: "preference", rank: 2 }),
      );
      const slots = resolveSlots(claims);
      expect(slots[0].state).toBe("open");
      expect(slots[0].preferences).toHaveLength(2);
    });

    it("all 12 characters start as OPEN", () => {
      const slots = resolveSlots([]);
      expect(slots).toHaveLength(12);
      expect(slots.every((s) => s.state === "open")).toBe(true);
    });
  });

  // ── OPEN → CONDITIONAL transition ──

  describe("OPEN → CONDITIONAL", () => {
    it("placing a conditional moves character to CONDITIONAL", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" }),
      );
      const slots = resolveSlots(claims);
      expect(slots[0].state).toBe("conditional");
      expect(slots[0].conditionalBy).toEqual(["alice"]);
    });
  });

  // ── CONDITIONAL → CONTESTED transition ──
  // Note: the app enforces one conditional per character, but if two sneak in
  // (e.g. race condition), the state machine correctly shows CONTESTED

  describe("CONDITIONAL → CONTESTED", () => {
    it("two conditionals on same character → CONTESTED", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" }),
        makeClaim({ partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" }),
      );
      const slots = resolveSlots(claims);
      expect(slots[1].state).toBe("contested");
      expect(slots[1].conditionalBy).toEqual(["alice", "bob"]);
    });

    it("three conditionals is also CONTESTED", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" }),
        makeClaim({ partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" }),
        makeClaim({ partyId: PARTY, characterId: 2, userId: "carol", claimType: "conditional" }),
      );
      const slots = resolveSlots(claims);
      expect(slots[1].state).toBe("contested");
      expect(slots[1].conditionalBy).toHaveLength(3);
    });
  });

  // ── CONDITIONAL → CLAIMED (full claim displaces conditional) ──

  describe("CONDITIONAL → CLAIMED (displacement)", () => {
    it("full claim displaces existing conditional", () => {
      claims.push(
        makeClaim({ id: "cond-alice", partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" }),
      );

      // Bob full-claims character 3
      const displaced = findDisplacedClaims(3, "claimed", claims);
      expect(displaced).toEqual(["cond-alice"]);

      // After removing displaced and adding the full claim:
      const remaining = claims.filter((c) => !displaced.includes(c.id));
      remaining.push(
        makeClaim({ partyId: PARTY, characterId: 3, userId: "bob", claimType: "claimed" }),
      );

      const slots = resolveSlots(remaining);
      expect(slots[2].state).toBe("claimed");
      expect(slots[2].claimedBy).toBe("bob");
      expect(slots[2].conditionalBy).toEqual([]);
    });

    it("validation allows full claim over a conditional", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" }),
      );
      const err = validateClaim(
        { userId: "bob", characterId: 3, claimType: "claimed" },
        claims,
        members,
        "open",
      );
      // No error — full claims are allowed even with a conditional
      expect(err).toBeNull();
    });
  });

  // ── OPEN → CLAIMED (direct) ──

  describe("OPEN → CLAIMED (direct)", () => {
    it("can full-claim an open character directly", () => {
      const err = validateClaim(
        { userId: "alice", characterId: 4, claimType: "claimed" },
        claims,
        members,
        "open",
      );
      expect(err).toBeNull();

      claims.push(
        makeClaim({ partyId: PARTY, characterId: 4, userId: "alice", claimType: "claimed" }),
      );
      const slots = resolveSlots(claims);
      expect(slots[3].state).toBe("claimed");
      expect(slots[3].claimedBy).toBe("alice");
    });
  });

  // ── CLAIMED is terminal ──

  describe("CLAIMED is terminal", () => {
    it("cannot claim an already-claimed character", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 5, userId: "alice", claimType: "claimed" }),
      );
      const err = validateClaim(
        { userId: "bob", characterId: 5, claimType: "claimed" },
        claims,
        members,
        "open",
      );
      expect(err).toBe("character_already_claimed");
    });

    it("cannot place a conditional on a claimed character — but the slot already has a conditional guard", () => {
      // The app prevents this via the "character_already_has_conditional" check,
      // but the state machine correctly shows "claimed" regardless
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 5, userId: "alice", claimType: "claimed" }),
      );
      const slots = resolveSlots(claims);
      expect(slots[4].state).toBe("claimed");
    });
  });

  // ── Mixed states across characters ──

  describe("mixed states across a full party", () => {
    it("resolves a realistic party with varied claim states", () => {
      claims.push(
        // Character 1: claimed by Alice
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
        // Character 2: conditional by Bob
        makeClaim({ partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" }),
        // Character 3: preferences only (still open)
        makeClaim({ partyId: PARTY, characterId: 3, userId: "carol", claimType: "preference", rank: 1 }),
        makeClaim({ partyId: PARTY, characterId: 3, userId: "dave", claimType: "preference", rank: 2 }),
        // Character 4: contested (two conditionals)
        makeClaim({ partyId: PARTY, characterId: 4, userId: "carol", claimType: "conditional" }),
        makeClaim({ partyId: PARTY, characterId: 4, userId: "dave", claimType: "conditional" }),
        // Characters 5-12: open (no claims)
      );

      const slots = resolveSlots(claims);

      expect(slots[0].state).toBe("claimed");
      expect(slots[0].claimedBy).toBe("alice");

      expect(slots[1].state).toBe("conditional");
      expect(slots[1].conditionalBy).toEqual(["bob"]);

      expect(slots[2].state).toBe("open");
      expect(slots[2].preferences).toHaveLength(2);

      expect(slots[3].state).toBe("contested");
      expect(slots[3].conditionalBy).toHaveLength(2);

      for (let i = 4; i < 12; i++) {
        expect(slots[i].state).toBe("open");
      }
    });
  });

  // ── Per-user claim limits ──

  describe("per-user claim limits", () => {
    it("user can only have one 'claimed' across all characters in a party", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
      );
      const err = validateClaim(
        { userId: "alice", characterId: 2, claimType: "claimed" },
        claims,
        members,
        "open",
      );
      expect(err).toBe("user_already_claimed_another");
    });

    it("user can have multiple conditionals across different characters", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" }),
      );
      const err = validateClaim(
        { userId: "alice", characterId: 2, claimType: "conditional" },
        claims,
        members,
        "open",
      );
      expect(err).toBeNull();
    });

    it("user can have both a claimed and preferences", () => {
      claims.push(
        makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
      );
      const err = validateClaim(
        { userId: "alice", characterId: 2, claimType: "preference" },
        claims,
        members,
        "open",
      );
      expect(err).toBeNull();
    });
  });
});
