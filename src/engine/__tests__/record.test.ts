import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { validateClaim, placeClaim, resolveSlots } from "../claims";
import { setupDb, insertUser, insertParty, insertMember, insertClaim, nextId } from "./helpers";

// ─── Phase 4: RECORD ──────────────────────────────────────
// "Record claims in the tool"

const PARTY = "p1";

describe("RECORD — placing preferences", () => {
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

  it("anyone can add a preference for any character", async () => {
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(err).toBeNull();
  });

  it("multiple users can prefer the same character", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 1, claimType: "preference",
    });
    expect(err).toBeNull();
  });

  it("preferences show up in resolved slot state", async () => {
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 3, claimType: "preference", rank: 1 });
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 3, claimType: "preference", rank: 2 });

    const slots = await resolveSlots(db, PARTY);
    const slot3 = slots.find((s) => s.characterId === 3)!;
    expect(slot3.state).toBe("open"); // preferences don't change state
    expect(slot3.preferences).toHaveLength(2);
    expect(slot3.preferences[0].userId).toBe("alice");
    expect(slot3.preferences[1].userId).toBe("bob");
  });
});

describe("RECORD — placing conditional claims", () => {
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

  it("allows a conditional claim on an open character", async () => {
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 5, claimType: "conditional",
    });
    expect(err).toBeNull();
  });

  it("rejects second conditional on same character", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "alice", claimType: "conditional" });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 5, claimType: "conditional",
    });
    expect(err).toBe("character_already_has_conditional");
  });

  it("allows a user to have conditional claims on different characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "alice", claimType: "conditional" });
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 6, claimType: "conditional",
    });
    expect(err).toBeNull();
  });
});

describe("RECORD — placing full claims", () => {
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

  it("allows claiming an open character", async () => {
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("rejects claiming an already-claimed character", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 1, claimType: "claimed",
    });
    expect(err).toBe("character_already_claimed");
  });

  it("allows a user to claim multiple characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 2, claimType: "claimed",
    });
    expect(err).toBeNull();
  });

  it("displaces a conditional when someone full-claims via placeClaim", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" });

    // Bob full-claims character 7 — should displace Alice's conditional
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 7, claimType: "claimed", rank: null });

    const slots = await resolveSlots(db, PARTY);
    const slot7 = slots.find((s) => s.characterId === 7)!;
    expect(slot7.state).toBe("claimed");
    expect(slot7.claimedBy).toBe("bob");
    expect(slot7.conditionalBy).toEqual([]);
  });

  it("does not displace conditionals for a preference", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" });
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 7, claimType: "preference", rank: 1 });

    const slots = await resolveSlots(db, PARTY);
    const slot7 = slots.find((s) => s.characterId === 7)!;
    expect(slot7.state).toBe("conditional");
    expect(slot7.conditionalBy).toEqual(["alice"]);
  });
});

describe("RECORD — guards", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "eve");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertParty(db, { id: "p-locked", leaderId: "leader", status: "locked" });
    await insertMember(db, PARTY, "alice");
  });

  it("rejects claims on a locked party", async () => {
    await insertMember(db, "p-locked", "alice");
    const err = await validateClaim(db, "p-locked", {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(err).toBe("party_locked");
  });

  it("rejects claims from non-members", async () => {
    const err = await validateClaim(db, PARTY, {
      userId: "eve", characterId: 1, claimType: "preference",
    });
    expect(err).toBe("not_a_member");
  });

  it("rejects invalid character IDs", async () => {
    expect(
      await validateClaim(db, PARTY, { userId: "alice", characterId: 0, claimType: "preference" }),
    ).toBe("invalid_character");
    expect(
      await validateClaim(db, PARTY, { userId: "alice", characterId: 13, claimType: "preference" }),
    ).toBe("invalid_character");
  });
});
