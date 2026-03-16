import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { listOpenParties, joinParty, otherParties, costPerPerson, isAutoPromoteDue } from "../parties";
import { validateClaim, placeClaim, resolveSlots, autoPromote } from "../claims";
import { getPartyEventLog, appendEvent } from "../events";
import { undoEvent } from "../undo";
import { replayPartyState } from "../replay";
import { setupDb, insertUser, insertParty, insertMember, nextId } from "./helpers";

// ═══════════════════════════════════════════════════════════
//  HAPPY PATH: Full 12-person party completes the flow
// ═══════════════════════════════════════════════════════════

describe("E2E: Golden path — 12 fans fill a party and buy the set", () => {
  let db: DrizzleD1Database;
  const PARTY = "niji-party-1";
  const userIds: string[] = [];

  beforeEach(async () => {
    db = await setupDb();
    userIds.length = 0;

    // Create 12 users (one is the leader)
    for (let i = 1; i <= 12; i++) {
      const uid = await insertUser(db, `fan-${i}`, `Fan ${i}`);
      userIds.push(uid);
    }

    // Leader creates the party
    await insertParty(db, {
      id: PARTY,
      name: "Niji Tokuten Squad",
      leaderId: userIds[0],
      languages: ["ja", "en"],
      groupChatLink: "https://discord.gg/niji-tokuten",
    });
    await insertMember(db, PARTY, userIds[0]);
    await appendEvent(db, {
      partyId: PARTY,
      userId: userIds[0],
      type: "party_created",
      payload: { partyId: PARTY },
    });
  });

  it("BROWSE → JOIN → RECORD → verify cost split → verify event log", async () => {
    // ── PHASE 1: BROWSE ──
    // The party should appear in listings
    const openParties = await listOpenParties(db);
    const listed = openParties.find((p) => p.id === PARTY);
    expect(listed).toBeDefined();
    expect(listed!.languages).toEqual(["ja", "en"]);
    expect(listed!.memberCount).toBe(1); // just the leader

    // Searchable by either language
    const jaParties = await listOpenParties(db, { language: "ja" });
    expect(jaParties.some((p) => p.id === PARTY)).toBe(true);
    const enParties = await listOpenParties(db, { language: "en" });
    expect(enParties.some((p) => p.id === PARTY)).toBe(true);
    // Not found in zh
    const zhParties = await listOpenParties(db, { language: "zh" });
    expect(zhParties.some((p) => p.id === PARTY)).toBe(false);

    // ── PHASE 2: JOIN ──
    // 11 more fans join
    for (let i = 1; i < 12; i++) {
      const result = await joinParty(db, PARTY, userIds[i]);
      expect(result.error).toBeNull();
      expect(result.eventId).toBeDefined();
    }

    // Party now shows 12 members in browse
    const refreshed = await listOpenParties(db);
    expect(refreshed.find((p) => p.id === PARTY)!.memberCount).toBe(12);

    // Multi-party transparency: leader is only in this party
    const others = await otherParties(db, userIds[0], PARTY);
    expect(others).toEqual([]);

    // ── PHASE 3: DISCUSS (implicit — group chat link available) ──
    // Members can see the Discord link
    const { getPartyWithGroupChatLink } = await import("../parties");
    const party = await getPartyWithGroupChatLink(db, PARTY);
    expect(party!.groupChatLink).toBe("https://discord.gg/niji-tokuten");

    // ── PHASE 4: RECORD ──
    // Each fan claims a unique character (1-12)
    for (let i = 0; i < 12; i++) {
      // First express preference
      const prefErr = await validateClaim(db, PARTY, {
        userId: userIds[i], characterId: i + 1, claimType: "preference",
      });
      expect(prefErr).toBeNull();
      await placeClaim(db, PARTY, {
        id: nextId(), userId: userIds[i], characterId: i + 1, claimType: "preference", rank: 1,
      });

      // Then conditionally claim
      const condErr = await validateClaim(db, PARTY, {
        userId: userIds[i], characterId: i + 1, claimType: "conditional",
      });
      expect(condErr).toBeNull();
      await placeClaim(db, PARTY, {
        id: nextId(), userId: userIds[i], characterId: i + 1, claimType: "conditional", rank: null,
      });
    }

    // All 12 characters should be CONDITIONAL with exactly one conditional each
    const slotsBeforePromote = await resolveSlots(db, PARTY);
    expect(slotsBeforePromote.every((s) => s.state === "conditional")).toBe(true);

    // ── Auto-promote when deadline hits ──
    const promoteResult = await autoPromote(db, PARTY);
    expect(promoteResult.promotedCount).toBe(12);
    expect(promoteResult.eventIds).toHaveLength(12);

    // All 12 characters should now be CLAIMED
    const slotsAfter = await resolveSlots(db, PARTY);
    expect(slotsAfter.every((s) => s.state === "claimed")).toBe(true);
    for (let i = 0; i < 12; i++) {
      expect(slotsAfter[i].claimedBy).toBe(userIds[i]);
    }

    // ── PHASE 5: BUY — cost split ──
    expect(costPerPerson(12)).toBe(1800); // ¥21,600 / 12 = ¥1,800

    // ── Event log is complete ──
    const log = await getPartyEventLog(db, PARTY, { limit: 200 });
    // party_created + 11 member_joined + 12 claim_placed (pref) + 12 claim_placed (cond) + 12 claim_promoted
    expect(log.length).toBe(1 + 11 + 12 + 12 + 12);

    // ── Replay matches materialized state ──
    const replayed = await replayPartyState(db, PARTY);
    expect(replayed.members).toHaveLength(11); // 11 joins (leader was inserted directly)
    expect(replayed.claims).toHaveLength(24); // 12 preferences + 12 conditionals→claimed
    const claimedInReplay = replayed.claims.filter((c) => c.claimType === "claimed");
    expect(claimedInReplay).toHaveLength(12);
  });
});

// ═══════════════════════════════════════════════════════════
//  HAPPY PATH: Small party (3 people) with contested characters
// ═══════════════════════════════════════════════════════════

describe("E2E: 3-person party with contested characters resolved through discussion", () => {
  let db: DrizzleD1Database;
  const PARTY = "small-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "yuu", "Yuu");
    await insertUser(db, "ayumu", "Ayumu");
    await insertUser(db, "setsuna", "Setsuna");

    await insertParty(db, {
      id: PARTY,
      name: "Yuu's Niji Squad",
      leaderId: "yuu",
      languages: ["ja"],
      groupChatLink: "https://line.me/niji",
    });
    await insertMember(db, PARTY, "yuu");
  });

  it("contest → discuss → resolve → direct claim", async () => {
    // Two fans join
    const j1 = await joinParty(db, PARTY, "ayumu");
    const j2 = await joinParty(db, PARTY, "setsuna");
    expect(j1.error).toBeNull();
    expect(j2.error).toBeNull();

    // Both want Ayumu Uehara (character 1) — they express preferences
    await placeClaim(db, PARTY, { id: nextId(), userId: "ayumu", characterId: 1, claimType: "preference", rank: 1 });
    await placeClaim(db, PARTY, { id: nextId(), userId: "setsuna", characterId: 1, claimType: "preference", rank: 1 });

    // Ayumu puts a conditional on character 1
    await placeClaim(db, PARTY, { id: nextId(), userId: "ayumu", characterId: 1, claimType: "conditional", rank: null });

    let slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("conditional");
    expect(slots[0].conditionalBy).toEqual(["ayumu"]);

    // Setsuna also places a conditional — now it's contested
    const condErr = await validateClaim(db, PARTY, {
      userId: "setsuna", characterId: 1, claimType: "conditional",
    });
    expect(condErr).toBeNull();
    await placeClaim(db, PARTY, { id: nextId(), userId: "setsuna", characterId: 1, claimType: "conditional", rank: null });

    slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("contested");
    expect(slots[0].conditionalBy.sort()).toEqual(["ayumu", "setsuna"]);

    // After discussion in LINE, they agree: Setsuna takes Setsuna Yuki (char 10) instead
    // Setsuna cancels her conditional on character 1
    const { cancelClaim } = await import("../claims");
    await cancelClaim(db, PARTY, "setsuna", 1, "conditional");

    // Setsuna full-claims character 10 directly
    await placeClaim(db, PARTY, { id: nextId(), userId: "setsuna", characterId: 10, claimType: "claimed", rank: null });

    // Ayumu full-claims character 1, displacing her own conditional
    const ayumuClaim = await placeClaim(db, PARTY, {
      id: nextId(), userId: "ayumu", characterId: 1, claimType: "claimed", rank: null,
    });
    // Displacement event + claim event
    expect(ayumuClaim.eventIds).toHaveLength(2);

    // Yuu claims character 12 (Lanzhu)
    await placeClaim(db, PARTY, { id: nextId(), userId: "yuu", characterId: 12, claimType: "claimed", rank: null });

    slots = await resolveSlots(db, PARTY);
    expect(slots[0].claimedBy).toBe("ayumu");
    expect(slots[9].claimedBy).toBe("setsuna");
    expect(slots[11].claimedBy).toBe("yuu");

    // 9 characters open + 2 wanted (the preferences on char 1 from both)
    // Actually char 1 is claimed, so its preferences don't matter.
    // Characters 2-9 and 11 have no claims = 9 open
    const openSlots = slots.filter((s) => s.state === "open");
    expect(openSlots).toHaveLength(9);

    // Cost split: ¥21,600 / 3 = ¥7,200
    expect(costPerPerson(3)).toBe(7200);

    // Event log should tell the whole story
    const log = await getPartyEventLog(db, PARTY);
    const types = log.map((e) => e.type);
    expect(types).toContain("member_joined");
    expect(types).toContain("claim_placed");
    expect(types).toContain("claim_displaced");
  });
});

// ═══════════════════════════════════════════════════════════
//  HAPPY PATH: Undo flow — user changes their mind quickly
// ═══════════════════════════════════════════════════════════

describe("E2E: User joins, claims, then quickly undoes everything", () => {
  let db: DrizzleD1Database;
  const PARTY = "undo-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "indecisive");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
  });

  it("undo join → undo claim → state fully reverted", async () => {
    // Join
    const joinResult = await joinParty(db, PARTY, "indecisive");
    expect(joinResult.error).toBeNull();

    // Place a preference
    const prefResult = await placeClaim(db, PARTY, {
      id: nextId(), userId: "indecisive", characterId: 5, claimType: "preference", rank: 1,
    });

    // Place a conditional
    const condResult = await placeClaim(db, PARTY, {
      id: nextId(), userId: "indecisive", characterId: 5, claimType: "conditional", rank: null,
    });

    // Verify state before undo
    let slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("conditional");
    expect(slots[4].preferences).toHaveLength(1);

    // Undo the conditional (most recent first)
    const undoCond = await undoEvent(db, condResult.eventIds[0], "indecisive");
    expect(undoCond).toBe("ok");

    slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("wanted"); // back to wanted (preference exists)
    expect(slots[4].preferences).toHaveLength(1); // preference still there

    // Undo the preference
    const undoPref = await undoEvent(db, prefResult.eventIds[0], "indecisive");
    expect(undoPref).toBe("ok");

    slots = await resolveSlots(db, PARTY);
    expect(slots[4].preferences).toHaveLength(0);

    // Undo the join
    const undoJoin = await undoEvent(db, joinResult.eventId!, "indecisive");
    expect(undoJoin).toBe("ok");

    // User can rejoin (proves membership was actually removed)
    const rejoin = await joinParty(db, PARTY, "indecisive");
    expect(rejoin.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  Duplicate preference prevention (event-sourced)
// ═══════════════════════════════════════════════════════════

describe("E2E: Duplicate preference prevention", () => {
  let db: DrizzleD1Database;
  const PARTY = "dup-pref-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
  });

  it("rejects duplicate preference and replay matches materialized state", async () => {
    // Alice preferences character 1
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });

    // Alice tries to preference character 1 again → rejected
    const err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(err).toBe("user_already_prefers_this_character");

    // Bob can still preference character 1
    const errBob = await validateClaim(db, PARTY, {
      userId: "bob", characterId: 1, claimType: "preference",
    });
    expect(errBob).toBeNull();
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "bob", characterId: 1, claimType: "preference", rank: 2,
    });

    // Materialized state shows exactly 2 preferences
    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].preferences).toHaveLength(2);

    // Replay from events matches materialized state
    const replayed = await replayPartyState(db, PARTY);
    const replayedPrefs = replayed.claims.filter(
      (c) => c.characterId === 1 && c.claimType === "preference",
    );
    expect(replayedPrefs).toHaveLength(2);
    expect(replayedPrefs.map((p) => p.userId).sort()).toEqual(["alice", "bob"]);
  });

  it("undo preference then re-add is allowed", async () => {
    const result = await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 1, claimType: "preference", rank: 1,
    });

    // Cannot add again
    let err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(err).toBe("user_already_prefers_this_character");

    // Undo the preference
    const undoResult = await undoEvent(db, result.eventIds[0], "alice");
    expect(undoResult).toBe("ok");

    // Now can re-add
    err = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(err).toBeNull();

    // Replay reflects undo — no preferences remain
    const replayed = await replayPartyState(db, PARTY);
    const replayedPrefs = replayed.claims.filter(
      (c) => c.characterId === 1 && c.claimType === "preference",
    );
    expect(replayedPrefs).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  HAPPY PATH: Time travel replay at different points
// ═══════════════════════════════════════════════════════════

describe("E2E: Time travel — replay party state at different moments", () => {
  let db: DrizzleD1Database;
  const PARTY = "time-travel";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
  });

  it("replay at t1 shows only joins, at t2 shows joins+claims", async () => {
    // Use insertEvent with explicit timestamps for controlled time travel
    const t0 = new Date("2026-03-01T00:00:00Z");
    const t1 = new Date("2026-03-02T00:00:00Z");
    const t2 = new Date("2026-03-03T00:00:00Z");
    const t3 = new Date("2026-03-04T00:00:00Z");
    const { insertEvent } = await import("./helpers");

    await insertEvent(db, {
      partyId: PARTY, userId: "alice", type: "member_joined",
      payload: { partyId: PARTY, userId: "alice" }, createdAt: t0,
    });
    await insertEvent(db, {
      partyId: PARTY, userId: "bob", type: "member_joined",
      payload: { partyId: PARTY, userId: "bob" }, createdAt: t1,
    });
    await insertEvent(db, {
      partyId: PARTY, userId: "alice", type: "claim_placed",
      payload: { claimId: "c1", characterId: 1, claimType: "conditional", rank: null }, createdAt: t2,
    });
    await insertEvent(db, {
      partyId: PARTY, userId: "bob", type: "claim_placed",
      payload: { claimId: "c2", characterId: 2, claimType: "conditional", rank: null }, createdAt: t3,
    });

    // At t1: both alice and bob have joined, no claims yet
    const stateAtT1 = await replayPartyState(db, PARTY, t1);
    expect(stateAtT1.members).toHaveLength(2);
    expect(stateAtT1.claims).toHaveLength(0);

    // At t2: both joined, alice has 1 claim
    const stateAtT2 = await replayPartyState(db, PARTY, t2);
    expect(stateAtT2.members).toHaveLength(2);
    expect(stateAtT2.claims).toHaveLength(1);
    expect(stateAtT2.claims[0].userId).toBe("alice");

    // At t3 (latest): both joined, both have claims
    const stateAtT3 = await replayPartyState(db, PARTY, t3);
    expect(stateAtT3.claims).toHaveLength(2);

    // Full replay (no upTo) = same as t3
    const stateFull = await replayPartyState(db, PARTY);
    expect(stateFull.claims).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
//  BAD PATH: Outsider tries to interfere with a party
// ═══════════════════════════════════════════════════════════

describe("E2E: Non-member cannot place claims or undo others' actions", () => {
  let db: DrizzleD1Database;
  const PARTY = "guarded-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "member");
    await insertUser(db, "outsider");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "member");
  });

  it("outsider is blocked at every step", async () => {
    // Outsider can't place any claim type
    for (const claimType of ["preference", "conditional", "claimed"] as const) {
      const err = await validateClaim(db, PARTY, {
        userId: "outsider", characterId: 1, claimType,
      });
      expect(err).toBe("not_a_member");
    }

    // Member places a claim
    const claimResult = await placeClaim(db, PARTY, {
      id: nextId(), userId: "member", characterId: 3, claimType: "conditional", rank: null,
    });

    // Outsider can't undo the member's claim
    const undoResult = await undoEvent(db, claimResult.eventIds[0], "outsider");
    expect(undoResult).toBe("not_yours");

    // Outsider can't see the group chat (not enforced in engine, but they can't
    // reach it without membership — just verify the data exists for members)
    const slots = await resolveSlots(db, PARTY);
    expect(slots[2].conditionalBy).toEqual(["member"]);
  });
});

// ═══════════════════════════════════════════════════════════
//  BAD PATH: Locked party blocks all mutations
// ═══════════════════════════════════════════════════════════

describe("E2E: Locked party rejects joins and claims", () => {
  let db: DrizzleD1Database;
  const PARTY = "locked-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "latecomer");
    await insertParty(db, { id: PARTY, leaderId: "leader", status: "locked" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
  });

  it("nobody new can join and existing members cannot claim", async () => {
    // Can't join
    const joinResult = await joinParty(db, PARTY, "latecomer");
    expect(joinResult.error).toBe("party_locked");
    expect(joinResult.eventId).toBeUndefined();

    // Existing member can't claim
    const claimErr = await validateClaim(db, PARTY, {
      userId: "alice", characterId: 1, claimType: "preference",
    });
    expect(claimErr).toBe("party_locked");

    // Party doesn't appear in open listings
    const openParties = await listOpenParties(db);
    expect(openParties.some((p) => p.id === PARTY)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
//  BAD PATH: Double-join, double-claim, invalid characters
// ═══════════════════════════════════════════════════════════

describe("E2E: Duplicate and invalid operations are rejected", () => {
  let db: DrizzleD1Database;
  const PARTY = "strict-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
  });

  it("rejects all invalid operations cleanly", async () => {
    // Double join
    const doubleJoin = await joinParty(db, PARTY, "alice");
    expect(doubleJoin.error).toBe("already_a_member");

    // Join nonexistent party
    const badParty = await joinParty(db, "nonexistent", "alice");
    expect(badParty.error).toBe("party_not_found");

    // Invalid character IDs
    expect(await validateClaim(db, PARTY, { userId: "alice", characterId: 0, claimType: "preference" }))
      .toBe("invalid_character");
    expect(await validateClaim(db, PARTY, { userId: "alice", characterId: 13, claimType: "preference" }))
      .toBe("invalid_character");
    expect(await validateClaim(db, PARTY, { userId: "alice", characterId: -1, claimType: "preference" }))
      .toBe("invalid_character");

    // Alice claims character 1
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 1, claimType: "claimed", rank: null,
    });

    // Alice cannot claim a second character (max 1 full claim per user per party)
    expect(await validateClaim(db, PARTY, { userId: "alice", characterId: 2, claimType: "claimed" }))
      .toBe("user_already_has_full_claim");

    // Bob can't claim the same character Alice claimed
    expect(await validateClaim(db, PARTY, { userId: "bob", characterId: 1, claimType: "claimed" }))
      .toBe("character_already_claimed");

    // Undo a nonexistent event
    expect(await undoEvent(db, "does-not-exist", "alice")).toBe("not_found");
  });
});

// ═══════════════════════════════════════════════════════════
//  BAD PATH: Undo window expires
// ═══════════════════════════════════════════════════════════

describe("E2E: Undo expires after 30 seconds", () => {
  let db: DrizzleD1Database;
  const PARTY = "expiry-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
  });

  it("claim placed 31 seconds ago cannot be undone", async () => {
    // Place a claim, then manually backdate the event to 31s ago
    const result = await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 5, claimType: "conditional", rank: null,
    });

    const { events } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const oldTime = new Date(Date.now() - 31_000);
    await db.update(events).set({ createdAt: oldTime }).where(eq(events.id, result.eventIds[0]));

    const undoResult = await undoEvent(db, result.eventIds[0], "alice");
    expect(undoResult).toBe("expired");

    // Claim still exists
    const slots = await resolveSlots(db, PARTY);
    expect(slots[4].state).toBe("conditional");
  });
});

// ═══════════════════════════════════════════════════════════
//  BAD PATH: User in multiple parties — transparency works
// ═══════════════════════════════════════════════════════════

describe("E2E: Multi-party user is transparent across parties", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader-a");
    await insertUser(db, "leader-b");
    await insertUser(db, "leader-c");
    await insertUser(db, "hopper"); // joins all parties
    await insertParty(db, { id: "pa", leaderId: "leader-a" });
    await insertParty(db, { id: "pb", leaderId: "leader-b" });
    await insertParty(db, { id: "pc", leaderId: "leader-c" });
    await insertMember(db, "pa", "leader-a");
    await insertMember(db, "pb", "leader-b");
    await insertMember(db, "pc", "leader-c");
  });

  it("leaders can see the hopper is in other parties", async () => {
    await joinParty(db, "pa", "hopper");
    await joinParty(db, "pb", "hopper");
    await joinParty(db, "pc", "hopper");

    // Leader of party A sees hopper is also in B and C
    const fromA = await otherParties(db, "hopper", "pa");
    expect(fromA.sort()).toEqual(["pb", "pc"]);

    // Leader of party B sees hopper is also in A and C
    const fromB = await otherParties(db, "hopper", "pb");
    expect(fromB.sort()).toEqual(["pa", "pc"]);

    // The hopper can claim in each party independently
    await placeClaim(db, "pa", { id: nextId(), userId: "hopper", characterId: 1, claimType: "claimed", rank: null });
    await placeClaim(db, "pb", { id: nextId(), userId: "hopper", characterId: 1, claimType: "claimed", rank: null });
    await placeClaim(db, "pc", { id: nextId(), userId: "hopper", characterId: 1, claimType: "claimed", rank: null });

    // Each party has hopper claiming character 1 independently
    for (const pid of ["pa", "pb", "pc"]) {
      const slots = await resolveSlots(db, pid);
      expect(slots[0].claimedBy).toBe("hopper");
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  EDGE CASE: Displacement chain — undo restores conditionals
// ═══════════════════════════════════════════════════════════

describe("E2E: Full claim displaces conditional, undo restores it", () => {
  let db: DrizzleD1Database;
  const PARTY = "displacement-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
  });

  it("full claim → undo → conditional restored → can reclaim differently", async () => {
    // Alice conditionally claims character 7 (Rina Tennoji)
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "alice", characterId: 7, claimType: "conditional", rank: null,
    });

    let slots = await resolveSlots(db, PARTY);
    expect(slots[6].state).toBe("conditional");
    expect(slots[6].conditionalBy).toEqual(["alice"]);

    // Bob full-claims character 7 — displaces Alice
    const bobClaim = await placeClaim(db, PARTY, {
      id: nextId(), userId: "bob", characterId: 7, claimType: "claimed", rank: null,
    });
    expect(bobClaim.eventIds).toHaveLength(2); // displaced + claimed

    slots = await resolveSlots(db, PARTY);
    expect(slots[6].state).toBe("claimed");
    expect(slots[6].claimedBy).toBe("bob");
    expect(slots[6].conditionalBy).toEqual([]); // Alice's conditional gone

    // Bob regrets it, undoes within 30s
    const claimEventId = bobClaim.eventIds[bobClaim.eventIds.length - 1]; // claim_placed event
    const undoResult = await undoEvent(db, claimEventId, "bob");
    expect(undoResult).toBe("ok");

    // Alice's conditional is restored!
    slots = await resolveSlots(db, PARTY);
    expect(slots[6].state).toBe("conditional");
    expect(slots[6].conditionalBy).toContain("alice");
    expect(slots[6].claimedBy).toBeNull();

    // Now Bob claims a different character instead
    await placeClaim(db, PARTY, {
      id: nextId(), userId: "bob", characterId: 8, claimType: "claimed", rank: null,
    });
    slots = await resolveSlots(db, PARTY);
    expect(slots[7].claimedBy).toBe("bob");

    // Event log shows the full story including undone events
    const fullLog = await getPartyEventLog(db, PARTY, { includeUndone: true });
    const undone = fullLog.filter((e) => e.undoneAt !== null);
    expect(undone.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  EDGE CASE: Auto-promote skips contested but promotes lone
// ═══════════════════════════════════════════════════════════

describe("E2E: Auto-promote deadline with mixed slot states", () => {
  let db: DrizzleD1Database;
  const PARTY = "deadline-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertUser(db, "carol");
    await insertParty(db, {
      id: PARTY, leaderId: "leader",
      autoPromoteDate: "2026-05-08",
    });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
    await insertMember(db, PARTY, "carol");
  });

  it("promotes lone conditionals, skips contested and already-claimed", async () => {
    // Character 1: already claimed by alice (should stay)
    await placeClaim(db, PARTY, { id: nextId(), userId: "alice", characterId: 1, claimType: "claimed", rank: null });

    // Character 2: lone conditional by bob (should promote)
    await placeClaim(db, PARTY, { id: nextId(), userId: "bob", characterId: 2, claimType: "conditional", rank: null });

    // Character 3: contested — two conditionals (should NOT promote)
    // Use insertClaim to bypass validation (simulating race/admin override)
    const { insertClaim } = await import("./helpers");
    await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "carol", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "leader", claimType: "conditional" });

    // Character 4-12: open (nothing to promote)

    // Verify pre-promote state
    let slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");
    expect(slots[1].state).toBe("conditional");
    expect(slots[2].state).toBe("contested");

    // Check deadline logic
    expect(isAutoPromoteDue("2026-05-08", new Date("2026-05-09T00:00:00+09:00"))).toBe(true);
    expect(isAutoPromoteDue("2026-05-08", new Date("2026-05-07T23:59:59+09:00"))).toBe(false);

    // Run auto-promote
    const result = await autoPromote(db, PARTY);
    expect(result.promotedCount).toBe(1); // only bob's conditional
    expect(result.eventIds).toHaveLength(1);

    // Verify post-promote state
    slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");  // alice unchanged
    expect(slots[0].claimedBy).toBe("alice");
    expect(slots[1].state).toBe("claimed");  // bob promoted!
    expect(slots[1].claimedBy).toBe("bob");
    expect(slots[2].state).toBe("contested"); // still contested, not promoted

    // Replay confirms the promotion event
    const replayed = await replayPartyState(db, PARTY);
    const bobClaim = replayed.claims.find(
      (c) => c.userId === "bob" && c.characterId === 2,
    );
    expect(bobClaim!.claimType).toBe("claimed");
  });
});

// ═══════════════════════════════════════════════════════════
//  EDGE CASE: Cost split with various party sizes
// ═══════════════════════════════════════════════════════════

describe("E2E: Cost split accuracy across party sizes", () => {
  it("calculates fair split for all realistic party sizes", () => {
    // ¥21,600 total
    expect(costPerPerson(1)).toBe(21600);
    expect(costPerPerson(2)).toBe(10800);
    expect(costPerPerson(3)).toBe(7200);
    expect(costPerPerson(4)).toBe(5400);
    expect(costPerPerson(6)).toBe(3600);
    expect(costPerPerson(12)).toBe(1800);

    // Odd splits round up (everyone pays slightly more, leader collects remainder)
    expect(costPerPerson(5)).toBe(4320);   // ceil(21600/5) = 4320
    expect(costPerPerson(7)).toBe(3086);   // ceil(21600/7) = 3086
    expect(costPerPerson(11)).toBe(1964);  // ceil(21600/11) = 1964

    // Edge case
    expect(costPerPerson(0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  EDGE CASE: Event log filtering and limits
// ═══════════════════════════════════════════════════════════

describe("E2E: Event log respects limits and undone filtering", () => {
  let db: DrizzleD1Database;
  const PARTY = "log-party";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
  });

  it("limit caps results, undone events filtered correctly", async () => {
    // Generate 10 events
    const eventIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const eid = await appendEvent(db, {
        partyId: PARTY,
        userId: "leader",
        type: "party_created",
        payload: { seq: i },
      });
      eventIds.push(eid);
    }

    // Limit to 5
    const limited = await getPartyEventLog(db, PARTY, { limit: 5 });
    expect(limited).toHaveLength(5);

    // Mark first 3 as undone
    const { events } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    for (let i = 0; i < 3; i++) {
      await db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, eventIds[i]));
    }

    // Default (exclude undone): 7 remaining
    const filtered = await getPartyEventLog(db, PARTY);
    expect(filtered).toHaveLength(7);

    // Include undone: still 10
    const all = await getPartyEventLog(db, PARTY, { includeUndone: true });
    expect(all).toHaveLength(10);
  });
});
