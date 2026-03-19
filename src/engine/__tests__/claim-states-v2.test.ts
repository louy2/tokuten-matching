import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { resolveSlots, validateClaim, placeClaim } from "../claims";
import { costPerCard, costBreakdown } from "../parties";
import { setupDb, insertUser, insertParty, insertMember, insertClaim, nextId } from "./helpers";

// ═══════════════════════════════════════════════════════════
//  NEW CLAIM STATES: wanted, contested via validation, per-user limits
// ═══════════════════════════════════════════════════════════

const PARTY = "p1";

describe("WANTED state — preferences exist but no claim", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
  });

  it("character with 1+ preferences and no conditional/claimed is WANTED", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("wanted");
    expect(slots[0].preferences).toHaveLength(1);
  });

  it("character with multiple preferences is still WANTED", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "bob", claimType: "preference", rank: 2 });
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("wanted");
    expect(slots[0].preferences).toHaveLength(2);
  });

  it("character with no claims at all is OPEN", async () => {
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("open");
    expect(slots[0].preferences).toHaveLength(0);
  });

  it("character with preference + conditional is CONDITIONAL (not WANTED)", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "bob", claimType: "conditional" });
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("conditional");
  });

  it("character with preference + claimed is CLAIMED (not WANTED)", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "bob", claimType: "claimed" });
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");
  });
});

describe("CONTESTED via normal claim flow — multiple conditionals allowed", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertUser(db, "carol");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
    await insertMember(db, PARTY, "carol");
  });

  it("allows second conditional on same character from different user", async () => {
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 5, claimType: "conditional",
    });
    expect(err).toBeNull();
  });

  it("two conditionals on same character → CONTESTED state", async () => {
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null });
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 5, claimType: "conditional", rank: null });

    const slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("contested");
    expect(slots[4].conditionalBy.sort()).toEqual(["alice", "bob"]);
  });

  it("three conditionals on same character is also CONTESTED", async () => {
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null });
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 5, claimType: "conditional", rank: null });
    await placeClaim(db, PARTY, { id: nextId(), userId: "carol", characterId: 5, claimType: "conditional", rank: null });

    const slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("contested");
    expect(slots[4].conditionalBy).toHaveLength(3);
  });

  it("same user cannot place two conditionals on same character", async () => {
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null });
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 5, claimType: "conditional",
    });
    expect(err).toBe("user_already_conditional_this_character");
  });

  it("cannot place conditional on already-claimed character", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 5, claimType: "conditional",
    });
    expect(err).toBe("character_already_claimed");
  });

  it("full claim displaces ALL conditionals on contested character", async () => {
    // Set up contested state
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null });
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 5, claimType: "conditional", rank: null });

    let slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("contested");

    // Carol full-claims — both conditionals displaced
    const result = await placeClaim(db, PARTY, {
      id: nextId(), userId: "carol", characterId: 5, claimType: "claimed", rank: null,
    });

    slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("claimed");
    expect(slots[4].claimedBy).toBe("carol");
    expect(slots[4].conditionalBy).toEqual([]);

    // 2 displacement events + 1 claim event
    expect(result.eventIds).toHaveLength(3);
  });
});

describe("Multi-character claims — user can fully claim multiple characters", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
  });

  it("allows first full claim", async () => {
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("allows second full claim on a different character", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 2, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("user can claim 3+ characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 3, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("still rejects claiming same character twice", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 1, claimType: "claimed",
    });
    expect(err).toBe("character_already_claimed");
  });

  it("different users can each have full claims on different characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 2, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("user can have full claims + conditionals on different characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "claimed" });

    // Conditional on char 3 — should be allowed
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 3, claimType: "conditional",
    });
    expect(err).toBeNull();
  });

  it("resolves multiple claimed characters for same user", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "alice", claimType: "claimed" });

    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");
    expect(slots[0].claimedBy).toBe("alice");
    expect(slots[1].state).toBe("claimed");
    expect(slots[1].claimedBy).toBe("alice");
    expect(slots[2].state).toBe("claimed");
    expect(slots[2].claimedBy).toBe("alice");
  });

  it("cost breakdown reflects multi-character claims correctly", () => {
    const claims = [
      { userId: "alice", count: 5 },
      { userId: "bob", count: 2 },
      { userId: "carol", count: 0 },
    ];
    const breakdown = costBreakdown(12000, claims);

    expect(breakdown.pricePerCard).toBe(1000);
    expect(breakdown.members.find((m) => m.userId === "alice")!.cost).toBe(5000);
    expect(breakdown.members.find((m) => m.userId === "bob")!.cost).toBe(2000);
    expect(breakdown.members.find((m) => m.userId === "carol")!.cost).toBe(0);
    expect(breakdown.claimedTotal).toBe(7000);
    expect(breakdown.unallocated).toBe(5000);
  });

  it("after cancelling one claim, user retains other claims", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 1, claimType: "claimed", rank: null,
    });
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 2, claimType: "claimed", rank: null,
    });

    // Cancel char 1
    const { cancelClaim } = await import("../claims");
    await cancelClaim(db, PARTY, "alice", 1, "claimed");

    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("open");
    expect(slots[1].state).toBe("claimed");
    expect(slots[1].claimedBy).toBe("alice");
  });

  it("user with full claims in party A can also claim in party B", async () => {
    await insertParty(db, { id: "p2", leaderId: "leader" });
    await insertMember(db, "p2", "alice");
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "claimed" });

    const err = await validateClaim(db, "p2", {
      userId: "alice", characterId: 1, claimType: "claimed",
    });
    expect(err).toBeNull();
  });
});

describe("Per-card cost split", () => {
  it("calculates cost per card as setPrice / 12", () => {
    expect(costPerCard(21600)).toBe(1800);
    expect(costPerCard(12000)).toBe(1000);
  });

  it("rounds up for uneven price per card", () => {
    expect(costPerCard(10000)).toBe(834); // ceil(10000/12) = 834
  });

  it("returns 0 for zero price", () => {
    expect(costPerCard(0)).toBe(0);
  });

  it("calculates cost breakdown per member based on claimed cards", () => {
    const claims = [
      { userId: "yuki", count: 1 },
      { userId: "hana", count: 2 },
      { userId: "mika", count: 0 },
    ];
    const breakdown = costBreakdown(12000, claims);

    expect(breakdown.pricePerCard).toBe(1000);
    expect(breakdown.members.find((m) => m.userId === "yuki")!.cost).toBe(1000);
    expect(breakdown.members.find((m) => m.userId === "hana")!.cost).toBe(2000);
    expect(breakdown.members.find((m) => m.userId === "mika")!.cost).toBe(0);
    expect(breakdown.claimedTotal).toBe(3000);
    expect(breakdown.unallocated).toBe(9000);
  });
});
