import { describe, it, expect, beforeEach } from "vitest";
import { filterParties, type BrowsePartyInfo } from "../parties";
import { makeParty, resetIds } from "./helpers";

// ─── Phase 1: BROWSE ──────────────────────────────────────
// "Find parties with open characters"

describe("BROWSE — find parties with open characters", () => {
  let parties: BrowsePartyInfo[];

  beforeEach(() => {
    resetIds();
    parties = [
      {
        party: makeParty({ id: "p1", language: "ja", status: "open" }),
        memberCount: 5,
        openSlots: 7,
        claimedSlots: 5,
      },
      {
        party: makeParty({ id: "p2", language: "en", status: "open" }),
        memberCount: 11,
        openSlots: 1,
        claimedSlots: 11,
      },
      {
        party: makeParty({ id: "p3", language: "ja", status: "locked" }),
        memberCount: 12,
        openSlots: 0,
        claimedSlots: 12,
      },
      {
        party: makeParty({ id: "p4", language: "zh", status: "open" }),
        memberCount: 0,
        openSlots: 12,
        claimedSlots: 0,
      },
    ];
  });

  it("returns only open parties by default", () => {
    const result = filterParties(parties, {});
    expect(result.map((p) => p.party.id)).toEqual(["p1", "p2", "p4"]);
  });

  it("filters by language", () => {
    const result = filterParties(parties, { language: "ja" });
    expect(result).toHaveLength(1);
    expect(result[0].party.id).toBe("p1");
  });

  it("filters to parties that need a character (have open slots)", () => {
    const result = filterParties(parties, { needsCharacter: 1 });
    // All open parties have openSlots > 0 here, so p1, p2, p4
    expect(result).toHaveLength(3);
  });

  it("excludes locked parties even if they match language", () => {
    const result = filterParties(parties, { language: "ja" });
    expect(result.every((p) => p.party.status === "open")).toBe(true);
  });

  it("returns empty for a language with no open parties", () => {
    const result = filterParties(parties, { language: "ko" });
    expect(result).toHaveLength(0);
  });

  it("shows member count and slot info for each party", () => {
    const result = filterParties(parties, { language: "en" });
    expect(result[0].memberCount).toBe(11);
    expect(result[0].openSlots).toBe(1);
    expect(result[0].claimedSlots).toBe(11);
  });
});
