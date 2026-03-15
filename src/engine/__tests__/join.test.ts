import { describe, it, expect } from "vitest";
import { validateJoin, otherParties } from "../parties";

// ─── Phase 2: JOIN ─────────────────────────────────────────
// "Join 1+ parties (show prefs)"

describe("JOIN — join a party", () => {
  it("allows joining an open party", () => {
    const err = validateJoin("open", ["user-a", "user-b"], "user-c");
    expect(err).toBeNull();
  });

  it("rejects joining a locked party", () => {
    const err = validateJoin("locked", ["user-a"], "user-c");
    expect(err).toBe("party_locked");
  });

  it("rejects joining a party you are already in", () => {
    const err = validateJoin("open", ["user-a", "user-b"], "user-a");
    expect(err).toBe("already_a_member");
  });
});

describe("JOIN — multi-party membership", () => {
  const allMemberships = [
    { partyId: "p1", userId: "alice" },
    { partyId: "p2", userId: "alice" },
    { partyId: "p3", userId: "alice" },
    { partyId: "p1", userId: "bob" },
  ];

  it("a user can be in multiple parties", () => {
    const others = otherParties("alice", "p1", allMemberships);
    expect(others).toEqual(["p2", "p3"]);
  });

  it("returns empty when user has no other parties", () => {
    const others = otherParties("bob", "p1", allMemberships);
    expect(others).toEqual([]);
  });

  it("shows multi-party transparency for leader view", () => {
    // Alice is in p1 and the leader is viewing p1 — they should see
    // that Alice is also in p2 and p3
    const others = otherParties("alice", "p1", allMemberships);
    expect(others).toHaveLength(2);
    expect(others).toContain("p2");
    expect(others).toContain("p3");
  });
});
