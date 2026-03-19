import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { resolveSlots, validateClaim, placeClaim } from "../claims";
import { setupDb, insertUser, insertParty, insertMember, insertClaim, nextId } from "./helpers";

// ─── Claim State Machine ───────────────────────────────────
//
//   OPEN → CONDITIONAL → CLAIMED
//              ↓
//          CONTESTED (2+ conditionals)
//
//   If someone full-claims over a conditional → conditional displaced
//   Auto-promote: single conditional → claimed on deadline

const PARTY = "p1";

describe("Claim State Machine", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertUser(db, "carol");
    await insertUser(db, "dave");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
    await insertMember(db, PARTY, "carol");
    await insertMember(db, PARTY, "dave");
  });

  // ── OPEN state ──

  describe("OPEN state", () => {
    it("character with no claims is OPEN", async () => {
      const slots = await resolveSlots(db, PARTY);
      expect(slots[0].state).toBe("open");
      expect(slots[0].claimedBy).toBeNull();
      expect(slots[0].conditionalBy).toEqual([]);
    });

    it("character with only preferences is WANTED", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "bob", claimType: "preference", rank: 2 });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[0].state).toBe("wanted");
      expect(slots[0].preferences).toHaveLength(2);
    });

    it("all 12 characters start as OPEN", async () => {
      const slots = await resolveSlots(db, PARTY);
      expect(slots).toHaveLength(12);
      expect(slots.every((s) => s.state === "open")).toBe(true);
    });
  });

  // ── OPEN → CONDITIONAL transition ──

  describe("OPEN → CONDITIONAL", () => {
    it("placing a conditional moves character to CONDITIONAL", async () => {
      await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 1, claimType: "conditional", rank: null });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[0].state).toBe("conditional");
      expect(slots[0].conditionalBy).toEqual(["alice"]);
    });
  });

  // ── CONDITIONAL → CONTESTED transition ──

  describe("CONDITIONAL → CONTESTED", () => {
    it("two conditionals on same character → CONTESTED", async () => {
      // Directly insert both to simulate race condition bypassing validation
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" });
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[1].state).toBe("contested");
      expect(slots[1].conditionalBy.sort()).toEqual(["alice", "bob"]);
    });

    it("three conditionals is also CONTESTED", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" });
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" });
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "carol", claimType: "conditional" });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[1].state).toBe("contested");
      expect(slots[1].conditionalBy).toHaveLength(3);
    });
  });

  // ── CONDITIONAL → CLAIMED (full claim displaces conditional) ──

  describe("CONDITIONAL → CLAIMED (displacement)", () => {
    it("full claim displaces existing conditional", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" });

      // Bob full-claims character 3
      await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 3, claimType: "claimed", rank: null });

      const slots = await resolveSlots(db, PARTY);
      expect(slots[2].state).toBe("claimed");
      expect(slots[2].claimedBy).toBe("bob");
      expect(slots[2].conditionalBy).toEqual([]);
    });

    it("validation allows full claim over a conditional", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" });
      const err = await validateClaim(db, PARTY, {
        userId: "bob", characterId: 3, claimType: "claimed",
      });
      expect(err).toBeNull();
    });
  });

  // ── OPEN → CLAIMED (direct) ──

  describe("OPEN → CLAIMED (direct)", () => {
    it("can full-claim an open character directly", async () => {
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 4, claimType: "claimed",
      });
      expect(err).toBeNull();

      await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 4, claimType: "claimed", rank: null });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[3].state).toBe("claimed");
      expect(slots[3].claimedBy).toBe("alice");
    });
  });

  // ── CLAIMED is terminal ──

  describe("CLAIMED is terminal", () => {
    it("cannot claim an already-claimed character", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "alice", claimType: "claimed" });
      const err = await validateClaim(db, PARTY, {
        userId: "bob", characterId: 5, claimType: "claimed",
      });
      expect(err).toBe("character_already_claimed");
    });

    it("claimed character stays claimed in resolved state", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "alice", claimType: "claimed" });
      const slots = await resolveSlots(db, PARTY);
      expect(slots[4].state).toBe("claimed");
    });
  });

  // ── Mixed states across characters ──

  describe("mixed states across a full party", () => {
    it("resolves a realistic party with varied claim states", async () => {
      // Character 1: claimed by Alice
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
      // Character 2: conditional by Bob
      await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" });
      // Character 3: preferences only (still open)
      await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "carol", claimType: "preference", rank: 1 });
      await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "dave", claimType: "preference", rank: 2 });
      // Character 4: contested (two conditionals)
      await insertClaim(db, { partyId: PARTY, characterId: 4, userId: "carol", claimType: "conditional" });
      await insertClaim(db, { partyId: PARTY, characterId: 4, userId: "dave", claimType: "conditional" });

      const slots = await resolveSlots(db, PARTY);

      expect(slots[0].state).toBe("claimed");
      expect(slots[0].claimedBy).toBe("alice");

      expect(slots[1].state).toBe("conditional");
      expect(slots[1].conditionalBy).toEqual(["bob"]);

      expect(slots[2].state).toBe("wanted");
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
    it("user can claim multiple characters in a party", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 2, claimType: "claimed",
      });
      expect(err).toBeNull();
    });

    it("user can have multiple conditionals across different characters", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" });
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 2, claimType: "conditional",
      });
      expect(err).toBeNull();
    });

    it("user cannot add duplicate preference for the same character", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 1, claimType: "preference",
      });
      expect(err).toBe("user_already_prefers_this_character");
    });

    it("user can prefer different characters", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 2, claimType: "preference",
      });
      expect(err).toBeNull();
    });

    it("different users can prefer the same character", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
      const err = await validateClaim(db, PARTY, {
        userId: "bob", characterId: 1, claimType: "preference",
      });
      expect(err).toBeNull();
    });

    it("user can have both a claimed and preferences", async () => {
      await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
      const err = await validateClaim(db, PARTY, {
        userId: "alice", characterId: 2, claimType: "preference",
      });
      expect(err).toBeNull();
    });
  });
});
