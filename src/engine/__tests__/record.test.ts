import { describe, it, expect, beforeEach } from "vitest";
import {
  validateClaim,
  findDisplacedClaims,
  resolveSlots,
  type Claim,
} from "../claims";
import { makeClaim, resetIds } from "./helpers";

// ─── Phase 4: RECORD ──────────────────────────────────────
// "Record claims in the tool"

const PARTY = "party-1";
const members = ["alice", "bob", "carol"];

describe("RECORD — placing preferences", () => {
  let claims: Claim[];

  beforeEach(() => {
    resetIds();
    claims = [];
  });

  it("anyone can add a preference for any character", () => {
    const err = validateClaim(
      { userId: "alice", characterId: 1, claimType: "preference" },
      claims,
      members,
      "open",
    );
    expect(err).toBeNull();
  });

  it("multiple users can prefer the same character", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "preference", rank: 1 }),
    );
    const err = validateClaim(
      { userId: "bob", characterId: 1, claimType: "preference" },
      claims,
      members,
      "open",
    );
    expect(err).toBeNull();
  });

  it("preferences show up in resolved slot state", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 3, userId: "alice", claimType: "preference", rank: 1 }),
      makeClaim({ partyId: PARTY, characterId: 3, userId: "bob", claimType: "preference", rank: 2 }),
    );
    const slots = resolveSlots(claims);
    const slot3 = slots.find((s) => s.characterId === 3)!;
    expect(slot3.state).toBe("open"); // preferences don't change state
    expect(slot3.preferences).toHaveLength(2);
    expect(slot3.preferences[0].userId).toBe("alice"); // rank 1 first
    expect(slot3.preferences[1].userId).toBe("bob");
  });
});

describe("RECORD — placing conditional claims", () => {
  let claims: Claim[];

  beforeEach(() => {
    resetIds();
    claims = [];
  });

  it("allows a conditional claim on an open character", () => {
    const err = validateClaim(
      { userId: "alice", characterId: 5, claimType: "conditional" },
      claims,
      members,
      "open",
    );
    expect(err).toBeNull();
  });

  it("rejects second conditional on same character", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 5, userId: "alice", claimType: "conditional" }),
    );
    const err = validateClaim(
      { userId: "bob", characterId: 5, claimType: "conditional" },
      claims,
      members,
      "open",
    );
    expect(err).toBe("character_already_has_conditional");
  });

  it("allows a user to have conditional claims on different characters", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 5, userId: "alice", claimType: "conditional" }),
    );
    const err = validateClaim(
      { userId: "alice", characterId: 6, claimType: "conditional" },
      claims,
      members,
      "open",
    );
    expect(err).toBeNull();
  });
});

describe("RECORD — placing full claims", () => {
  let claims: Claim[];

  beforeEach(() => {
    resetIds();
    claims = [];
  });

  it("allows claiming an open character", () => {
    const err = validateClaim(
      { userId: "alice", characterId: 1, claimType: "claimed" },
      claims,
      members,
      "open",
    );
    expect(err).toBeNull();
  });

  it("rejects claiming an already-claimed character", () => {
    claims.push(
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
    );
    const err = validateClaim(
      { userId: "bob", characterId: 1, claimType: "claimed" },
      claims,
      members,
      "open",
    );
    expect(err).toBe("character_already_claimed");
  });

  it("rejects a user claiming a second character (max 1 claimed per user)", () => {
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

  it("displaces a conditional when someone full-claims", () => {
    claims.push(
      makeClaim({ id: "cond-1", partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" }),
    );
    const displaced = findDisplacedClaims(7, "claimed", claims);
    expect(displaced).toEqual(["cond-1"]);
  });

  it("does not displace anything for a preference", () => {
    claims.push(
      makeClaim({ id: "cond-1", partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" }),
    );
    const displaced = findDisplacedClaims(7, "preference", claims);
    expect(displaced).toEqual([]);
  });
});

describe("RECORD — guards", () => {
  it("rejects claims on a locked party", () => {
    const err = validateClaim(
      { userId: "alice", characterId: 1, claimType: "preference" },
      [],
      members,
      "locked",
    );
    expect(err).toBe("party_locked");
  });

  it("rejects claims from non-members", () => {
    const err = validateClaim(
      { userId: "eve", characterId: 1, claimType: "preference" },
      [],
      members,
      "open",
    );
    expect(err).toBe("not_a_member");
  });

  it("rejects invalid character IDs", () => {
    expect(
      validateClaim({ userId: "alice", characterId: 0, claimType: "preference" }, [], members, "open"),
    ).toBe("invalid_character");
    expect(
      validateClaim({ userId: "alice", characterId: 13, claimType: "preference" }, [], members, "open"),
    ).toBe("invalid_character");
  });
});
