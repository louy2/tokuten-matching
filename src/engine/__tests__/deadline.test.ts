import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { autoPromote, resolveSlots } from "../claims";
import { costPerPerson, daysUntilDeadline, isAutoPromoteDue } from "../parties";
import { setupDb, insertUser, insertParty, insertMember, insertClaim } from "./helpers";

// ─── Phase 5: BUY — May 15 deadline ───────────────────────

const PARTY = "p1";

describe("BUY — countdown to May 15", () => {
  it("counts days correctly from 2 months out", () => {
    const march15 = new Date("2026-03-15T12:00:00+09:00");
    const days = daysUntilDeadline(march15);
    expect(days).toBe(61);
  });

  it("counts 0 days on or after May 15", () => {
    const may15 = new Date("2026-05-15T09:00:00+09:00");
    expect(daysUntilDeadline(may15)).toBe(0);

    const may16 = new Date("2026-05-16T00:00:00+09:00");
    expect(daysUntilDeadline(may16)).toBe(0);
  });

  it("counts 1 day on May 14", () => {
    const may14 = new Date("2026-05-14T00:00:00+09:00");
    expect(daysUntilDeadline(may14)).toBe(1);
  });
});

describe("BUY — auto-promote deadline", () => {
  it("is not due before the date", () => {
    expect(isAutoPromoteDue("2026-05-08", new Date("2026-05-07T23:59:59+09:00"))).toBe(false);
  });

  it("is due on the date", () => {
    expect(isAutoPromoteDue("2026-05-08", new Date("2026-05-08T00:00:00+09:00"))).toBe(true);
  });

  it("is due after the date", () => {
    expect(isAutoPromoteDue("2026-05-08", new Date("2026-05-10T12:00:00+09:00"))).toBe(true);
  });

  it("returns false for null date", () => {
    expect(isAutoPromoteDue(null)).toBe(false);
  });
});

describe("BUY — auto-promote claim logic (D1)", () => {
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

  it("promotes a lone conditional to claimed", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" });
    const count = await autoPromote(db, PARTY);
    expect(count).toBe(1);

    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");
    expect(slots[0].claimedBy).toBe("alice");
  });

  it("does not promote if character is already claimed", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    const count = await autoPromote(db, PARTY);
    expect(count).toBe(0);
  });

  it("does not promote contested characters (2+ conditionals)", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" });
    const count = await autoPromote(db, PARTY);
    expect(count).toBe(0);
  });

  it("promotes multiple lone conditionals across different characters", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 5, userId: "bob", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 9, userId: "carol", claimType: "conditional" });
    const count = await autoPromote(db, PARTY);
    expect(count).toBe(3);

    const slots = await resolveSlots(db, PARTY);
    expect(slots[0].state).toBe("claimed");
    expect(slots[4].state).toBe("claimed");
    expect(slots[8].state).toBe("claimed");
  });

  it("after promotion, slot state changes from conditional to claimed", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" });

    const slotsBefore = await resolveSlots(db, PARTY);
    expect(slotsBefore[0].state).toBe("conditional");

    await autoPromote(db, PARTY);

    const slotsAfter = await resolveSlots(db, PARTY);
    expect(slotsAfter[0].state).toBe("claimed");
    expect(slotsAfter[0].claimedBy).toBe("alice");
  });
});

describe("BUY — cost split", () => {
  it("splits evenly among members with claims", () => {
    expect(costPerPerson(12)).toBe(1800);
  });

  it("rounds up for uneven splits", () => {
    expect(costPerPerson(7)).toBe(3086);
  });

  it("handles single buyer", () => {
    expect(costPerPerson(1)).toBe(21600);
  });

  it("returns 0 when nobody has claims", () => {
    expect(costPerPerson(0)).toBe(0);
  });
});
