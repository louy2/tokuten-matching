import { describe, it, expect } from "vitest";
import { resolveSlots, type Claim } from "../claims";
import { makeClaim, makeParty, resetIds } from "./helpers";

// ─── Phase 3: DISCUSS ─────────────────────────────────────
// "Talk in external group chat"
//
// The tool doesn't own the discussion — it happens in LINE/Discord/etc.
// But the tool surfaces information that drives discussion:
// - group chat link visibility
// - contested character alerts
// - multi-party warnings

const PARTY = "party-1";

describe("DISCUSS — group chat link", () => {
  it("party with a group chat link makes it available to members", () => {
    const party = makeParty({
      id: PARTY,
      groupChatLink: "https://discord.gg/abc123",
    });
    expect(party.groupChatLink).toBe("https://discord.gg/abc123");
  });

  it("party without a group chat link returns null", () => {
    const party = makeParty({ id: PARTY });
    expect(party.groupChatLink).toBeNull();
  });
});

describe("DISCUSS — contested character detection", () => {
  beforeEach(() => resetIds());

  it("detects contested characters that need discussion", () => {
    const claims: Claim[] = [
      makeClaim({ partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" }),
      makeClaim({ partyId: PARTY, characterId: 7, userId: "bob", claimType: "conditional" }),
    ];

    const slots = resolveSlots(claims);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(1);
    expect(contested[0].characterId).toBe(7);
    expect(contested[0].conditionalBy).toEqual(["alice", "bob"]);
  });

  it("reports no contested characters when all are clean", () => {
    const claims: Claim[] = [
      makeClaim({ partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" }),
      makeClaim({ partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" }),
    ];
    const slots = resolveSlots(claims);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(0);
  });

  it("multiple characters can be contested simultaneously", () => {
    const claims: Claim[] = [
      makeClaim({ partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" }),
      makeClaim({ partyId: PARTY, characterId: 3, userId: "bob", claimType: "conditional" }),
      makeClaim({ partyId: PARTY, characterId: 8, userId: "carol", claimType: "conditional" }),
      makeClaim({ partyId: PARTY, characterId: 8, userId: "dave", claimType: "conditional" }),
    ];
    const slots = resolveSlots(claims);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(2);
    expect(contested.map((s) => s.characterId).sort()).toEqual([3, 8]);
  });
});
