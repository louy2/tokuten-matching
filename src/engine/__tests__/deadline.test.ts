import { describe, it, expect, beforeEach } from "vitest";
import { findAutoPromotable, resolveSlots, type Claim } from "../claims";
import { costPerPerson, daysUntilDeadline, isAutoPromoteDue } from "../parties";
import { makeClaim, resetIds } from "./helpers";

// ─── Phase 5: BUY — May 15 deadline ───────────────────────

const PARTY = "party-1";

describe("BUY — countdown to May 15", () => {
  it("counts days correctly from 2 months out", () => {
    const march15 = new Date("2026-03-15T12:00:00+09:00");
    const days = daysUntilDeadline(march15);
    expect(days).toBe(61); // Mar 15 → May 15 = 61 days
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

describe("BUY — auto-promote claim logic", () => {
  let claims: Claim[];

  beforeEach(() => {
    resetIds();
    claims = [];
  });

  it("promotes a lone conditional to claimed", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" }),
    );
    const toPromote = findAutoPromotable(claims);
    expect(toPromote).toHaveLength(1);
  });

  it("does not promote if character is already claimed", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
    );
    const toPromote = findAutoPromotable(claims);
    expect(toPromote).toHaveLength(0);
  });

  it("does not promote contested characters (2+ conditionals)", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 2, userId: "alice", claimType: "conditional" }),
      makeClaim({ partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" }),
    );
    const toPromote = findAutoPromotable(claims);
    expect(toPromote).toHaveLength(0);
  });

  it("promotes multiple lone conditionals across different characters", () => {
    claims.push(
      makeClaim({ id: "c1", partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" }),
      makeClaim({ id: "c2", partyId: PARTY, characterId: 5, userId: "bob", claimType: "conditional" }),
      makeClaim({ id: "c3", partyId: PARTY, characterId: 9, userId: "carol", claimType: "conditional" }),
    );
    const toPromote = findAutoPromotable(claims);
    expect(toPromote).toEqual(["c1", "c2", "c3"]);
  });

  it("after promotion, slot state changes from conditional to claimed", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "conditional" }),
    );

    // Simulate promotion by changing claim type
    const promoted: Claim[] = claims.map((c) =>
      findAutoPromotable(claims).includes(c.id)
        ? { ...c, claimType: "claimed" as const }
        : c,
    );

    const slots = resolveSlots(promoted);
    expect(slots[0].state).toBe("claimed");
    expect(slots[0].claimedBy).toBe("alice");
  });
});

describe("BUY — cost split", () => {
  it("splits evenly among members with claims", () => {
    expect(costPerPerson(12)).toBe(1800); // ¥21,600 / 12 = ¥1,800
  });

  it("rounds up for uneven splits", () => {
    expect(costPerPerson(7)).toBe(3086); // ceil(21600/7) = 3086
  });

  it("handles single buyer", () => {
    expect(costPerPerson(1)).toBe(21600);
  });

  it("returns 0 when nobody has claims", () => {
    expect(costPerPerson(0)).toBe(0);
  });
});
