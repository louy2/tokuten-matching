import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { events } from "../../db/schema";
import { appendEvent, getPartyEventLog } from "../events";
import { placeClaim } from "../claims";
import { joinParty } from "../parties";
import { undoEvent } from "../undo";
import { replayPartyState } from "../replay";
import { setupDb, insertUser, insertParty, insertMember, insertClaim, nextId } from "./helpers";

const PARTY = "p1";

// ─── Event Sourcing: append & read ──────────────────────

describe("Event log — append and read", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
  });

  it("appendEvent writes and getPartyEventLog reads", async () => {
    await appendEvent(db, {
      partyId: PARTY,
      userId: "leader",
      type: "party_created",
      payload: { partyId: PARTY },
    });

    const log = await getPartyEventLog(db, PARTY);
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe("party_created");
    expect(log[0].payload).toEqual({ partyId: PARTY });
    // UUIDv7 format check
    expect(log[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("excludes undone events by default", async () => {
    const e1 = await appendEvent(db, {
      partyId: PARTY,
      userId: "leader",
      type: "party_created",
      payload: {},
    });
    const e2 = await appendEvent(db, {
      partyId: PARTY,
      userId: "leader",
      type: "member_joined",
      payload: {},
    });

    // Manually mark e1 as undone
    await db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, e1));

    const log = await getPartyEventLog(db, PARTY);
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe(e2);

    const logAll = await getPartyEventLog(db, PARTY, { includeUndone: true });
    expect(logAll).toHaveLength(2);
  });
});

// ─── Dual-write: joinParty emits events ─────────────────

describe("Dual-write — joinParty", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
  });

  it("emits member_joined event on successful join", async () => {
    const result = await joinParty(db, PARTY, "alice");
    expect(result.error).toBeNull();
    expect(result.eventId).toBeDefined();

    const log = await getPartyEventLog(db, PARTY);
    const joinEvt = log.find((e) => e.type === "member_joined");
    expect(joinEvt).toBeDefined();
    expect(joinEvt!.userId).toBe("alice");
  });

  it("does not emit event on failed join", async () => {
    await insertParty(db, { id: "locked", leaderId: "leader", status: "locked" });
    const lockResult = await joinParty(db, "locked", "alice");
    expect(lockResult.error).toBe("party_locked");
    expect(lockResult.eventId).toBeUndefined();
  });
});

// ─── Dual-write: placeClaim emits events ────────────────

describe("Dual-write — placeClaim", () => {
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

  it("emits claim_placed event", async () => {
    const result = await placeClaim(db, PARTY, {
      id: "c1", userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });
    expect(result.eventIds).toHaveLength(1);

    const log = await getPartyEventLog(db, PARTY);
    expect(log.some((e) => e.type === "claim_placed")).toBe(true);
  });

  it("emits claim_displaced + claim_placed when full-claiming over conditional", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" });

    const result = await placeClaim(db, PARTY, {
      id: "c2", userId: "bob", characterId: 7, claimType: "claimed", rank: null,
    });
    // Should have displacement event + claim event
    expect(result.eventIds).toHaveLength(2);

    const log = await getPartyEventLog(db, PARTY);
    expect(log.some((e) => e.type === "claim_displaced")).toBe(true);
    expect(log.some((e) => e.type === "claim_placed")).toBe(true);
  });
});

// ─── Undo ────────────────────────────────────────────────

describe("Undo — claim_placed", () => {
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

  it("undoes a claim within the 30-second window", async () => {
    const result = await placeClaim(db, PARTY, {
      id: "c1", userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });
    // The last event is the claim_placed (displacement events come first)
    const claimEventId = result.eventIds[result.eventIds.length - 1];

    const undoResult = await undoEvent(db, claimEventId, "alice");
    expect(undoResult).toBe("ok");

    // Claim should be removed from materialized state
    const { resolveSlots } = await import("../claims");
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].preferences).toHaveLength(0);
  });

  it("restores displaced conditional when undoing a full claim", async () => {
    // Alice has a conditional on character 7
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" });

    // Bob full-claims character 7, displacing Alice
    const result = await placeClaim(db, PARTY, {
      id: "c2", userId: "bob", characterId: 7, claimType: "claimed", rank: null,
    });
    // Last event is claim_placed
    const claimEventId = result.eventIds[result.eventIds.length - 1];

    // Bob undoes the full claim
    const undoResult = await undoEvent(db, claimEventId, "bob");
    expect(undoResult).toBe("ok");

    // Alice's conditional should be restored
    const { resolveSlots } = await import("../claims");
    const slots = await resolveSlots(db, PARTY);
    const slot7 = slots.find((s) => s.characterId === 7)!;
    expect(slot7.state).toBe("conditional");
    expect(slot7.conditionalBy).toContain("alice");
  });

  it("rejects undo from a different user", async () => {
    const result = await placeClaim(db, PARTY, {
      id: "c1", userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });
    const claimEventId = result.eventIds[0];

    const undoResult = await undoEvent(db, claimEventId, "bob");
    expect(undoResult).toBe("not_yours");
  });

  it("rejects undo on already-undone event", async () => {
    const result = await placeClaim(db, PARTY, {
      id: "c1", userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });
    const claimEventId = result.eventIds[0];

    await undoEvent(db, claimEventId, "alice");
    const secondUndo = await undoEvent(db, claimEventId, "alice");
    expect(secondUndo).toBe("already_undone");
  });

  it("rejects undo on non-existent event", async () => {
    const result = await undoEvent(db, "nonexistent", "alice");
    expect(result).toBe("not_found");
  });

  it("rejects undo on non-undoable event types", async () => {
    const lockEventId = await appendEvent(db, {
      partyId: PARTY,
      userId: "leader",
      type: "party_locked",
      payload: {},
    });
    const result = await undoEvent(db, lockEventId, "leader");
    expect(result).toBe("not_undoable");
  });
});

describe("Undo — member_joined", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
  });

  it("undoes a join (removes membership)", async () => {
    const joinResult = await joinParty(db, PARTY, "alice");
    expect(joinResult.error).toBeNull();

    const undoResult = await undoEvent(db, joinResult.eventId!, "alice");
    expect(undoResult).toBe("ok");

    // Alice should no longer be a member — trying to join again should succeed
    const rejoin = await joinParty(db, PARTY, "alice");
    expect(rejoin.error).toBeNull();
  });
});

// ─── Replay ──────────────────────────────────────────────

describe("Replay — reconstruct state from events", () => {
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

  it("replays member_joined and claim_placed events", async () => {
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "member_joined", payload: { partyId: PARTY, userId: "alice" },
    });
    await appendEvent(db, {
      partyId: PARTY, userId: "bob",
      type: "member_joined", payload: { partyId: PARTY, userId: "bob" },
    });
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "claim_placed", payload: { claimId: "c1", characterId: 1, claimType: "conditional", rank: null },
    });

    const state = await replayPartyState(db, PARTY);
    expect(state.members).toHaveLength(2);
    expect(state.claims).toHaveLength(1);
    expect(state.claims[0].claimType).toBe("conditional");
  });

  it("displacement removes the displaced claim from replay state", async () => {
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "claim_placed", payload: { claimId: "c1", characterId: 3, claimType: "conditional", rank: null },
    });
    await appendEvent(db, {
      partyId: PARTY, userId: "bob",
      type: "claim_displaced", payload: { displacedClaimId: "c1", displacedUserId: "alice", characterId: 3, byUserId: "bob" },
    });
    await appendEvent(db, {
      partyId: PARTY, userId: "bob",
      type: "claim_placed", payload: { claimId: "c2", characterId: 3, claimType: "claimed", rank: null },
    });

    const state = await replayPartyState(db, PARTY);
    expect(state.claims).toHaveLength(1);
    expect(state.claims[0].claimId).toBe("c2");
    expect(state.claims[0].claimType).toBe("claimed");
  });

  it("promotion changes claimType in replay state", async () => {
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "claim_placed", payload: { claimId: "c1", characterId: 5, claimType: "conditional", rank: null },
    });
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "claim_promoted", payload: { claimId: "c1", characterId: 5, userId: "alice" },
    });

    const state = await replayPartyState(db, PARTY);
    expect(state.claims).toHaveLength(1);
    expect(state.claims[0].claimType).toBe("claimed");
  });

  it("excludes undone events from replay", async () => {
    await appendEvent(db, {
      partyId: PARTY, userId: "alice",
      type: "member_joined", payload: { partyId: PARTY, userId: "alice" },
    });
    const e2 = await appendEvent(db, {
      partyId: PARTY, userId: "bob",
      type: "member_joined", payload: { partyId: PARTY, userId: "bob" },
    });

    // Mark e2 as undone
    await db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, e2));

    const state = await replayPartyState(db, PARTY);
    expect(state.members).toHaveLength(1);
    expect(state.members[0].userId).toBe("alice");
  });
});
