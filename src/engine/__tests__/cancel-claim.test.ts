import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { cancelClaim, placeClaim, resolveSlots } from "../claims";
import { getPartyEventLog } from "../events";
import { setupDb, insertUser, insertParty, insertMember, insertClaim, nextId } from "./helpers";

const PARTY = "p1";

describe("cancelClaim — cancelling conditional claims", () => {
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

  it("allows cancelling own conditional claim", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null,
    });

    const result = await cancelClaim(db, PARTY, "alice", 5, "conditional");
    expect(result).toHaveProperty("eventId");

    const slots = await resolveSlots(db, PARTY);
    const slot5 = slots.find((s) => s.characterId === 5)!;
    expect(slot5.state).toBe("open");
    expect(slot5.conditionalBy).toEqual([]);
  });

  it("logs a claim_cancelled event", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null,
    });

    await cancelClaim(db, PARTY, "alice", 5, "conditional");

    const eventLog = await getPartyEventLog(db, PARTY);
    const cancelEvent = eventLog.find((e) => e.type === "claim_cancelled");
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent!.userId).toBe("alice");
    expect(cancelEvent!.payload).toMatchObject({
      characterId: 5,
      claimType: "conditional",
    });
  });

  it("rejects cancelling a claim that does not exist", async () => {
    const result = await cancelClaim(db, PARTY, "alice", 5, "conditional");
    expect(result).toEqual({ error: "claim_not_found" });
  });

  it("rejects cancelling another user's conditional claim", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null,
    });

    const result = await cancelClaim(db, PARTY, "bob", 5, "conditional");
    expect(result).toEqual({ error: "claim_not_found" });

    // Alice's claim should still exist
    const slots = await resolveSlots(db, PARTY);
    const slot5 = slots.find((s) => s.characterId === 5)!;
    expect(slot5.state).toBe("conditional");
    expect(slot5.conditionalBy).toEqual(["alice"]);
  });
});

describe("cancelClaim — cancelling full claims", () => {
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

  it("allows cancelling own full claim", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 3, claimType: "claimed", rank: null,
    });

    const result = await cancelClaim(db, PARTY, "alice", 3, "claimed");
    expect(result).toHaveProperty("eventId");

    const slots = await resolveSlots(db, PARTY);
    const slot3 = slots.find((s) => s.characterId === 3)!;
    expect(slot3.state).toBe("open");
    expect(slot3.claimedBy).toBeNull();
  });

  it("allows user to claim again after cancelling full claim", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 3, claimType: "claimed", rank: null,
    });

    await cancelClaim(db, PARTY, "alice", 3, "claimed");

    // Alice should be able to claim a different character now
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 7, claimType: "claimed", rank: null,
    });

    const slots = await resolveSlots(db, PARTY);
    const slot7 = slots.find((s) => s.characterId === 7)!;
    expect(slot7.state).toBe("claimed");
    expect(slot7.claimedBy).toBe("alice");
  });

  it("rejects cancelling another user's full claim", async () => {
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 3, claimType: "claimed", rank: null,
    });

    const result = await cancelClaim(db, PARTY, "bob", 3, "claimed");
    expect(result).toEqual({ error: "claim_not_found" });
  });
});

describe("cancelClaim — guards", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "eve");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertParty(db, { id: "p-locked", leaderId: "leader", status: "locked" });
    await insertMember(db, PARTY, "alice");
    await insertMember(db, "p-locked", "alice");
  });

  it("rejects cancellation on a locked party", async () => {
    await insertClaim(db, {
      partyId: "p-locked", characterId: 1, userId: "alice", claimType: "conditional",
    });

    const result = await cancelClaim(db, "p-locked", "alice", 1, "conditional");
    expect(result).toEqual({ error: "party_locked" });
  });

  it("rejects cancellation from non-members", async () => {
    const result = await cancelClaim(db, PARTY, "eve", 1, "conditional");
    expect(result).toEqual({ error: "not_a_member" });
  });
});
