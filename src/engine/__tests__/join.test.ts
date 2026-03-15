import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { joinParty, otherParties } from "../parties";
import { setupDb, insertUser, insertParty, insertMember } from "./helpers";

// ─── Phase 2: JOIN ─────────────────────────────────────────
// "Join 1+ parties (show prefs)"

describe("JOIN — join a party", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: "p1", leaderId: "leader", status: "open" });
    await insertParty(db, { id: "p-locked", leaderId: "leader", status: "locked" });
    await insertMember(db, "p1", "alice");
  });

  it("allows joining an open party", async () => {
    const err = await joinParty(db, "p1", "bob");
    expect(err).toBeNull();
  });

  it("rejects joining a locked party", async () => {
    const err = await joinParty(db, "p-locked", "bob");
    expect(err).toBe("party_locked");
  });

  it("rejects joining a party you are already in", async () => {
    const err = await joinParty(db, "p1", "alice");
    expect(err).toBe("already_a_member");
  });
});

describe("JOIN — multi-party membership", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertParty(db, { id: "p1", leaderId: "leader" });
    await insertParty(db, { id: "p2", leaderId: "leader" });
    await insertParty(db, { id: "p3", leaderId: "leader" });
    await insertMember(db, "p1", "alice");
    await insertMember(db, "p2", "alice");
    await insertMember(db, "p3", "alice");
    await insertMember(db, "p1", "bob");
  });

  it("a user can be in multiple parties", async () => {
    const others = await otherParties(db, "alice", "p1");
    expect(others.sort()).toEqual(["p2", "p3"]);
  });

  it("returns empty when user has no other parties", async () => {
    const others = await otherParties(db, "bob", "p1");
    expect(others).toEqual([]);
  });

  it("shows multi-party transparency for leader view", async () => {
    const others = await otherParties(db, "alice", "p1");
    expect(others).toHaveLength(2);
    expect(others).toContain("p2");
    expect(others).toContain("p3");
  });
});
