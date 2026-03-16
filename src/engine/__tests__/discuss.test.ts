import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { resolveSlots } from "../claims";
import { getPartyWithGroupChatLink } from "../parties";
import { setupDb, insertUser, insertParty, insertClaim } from "./helpers";

// ─── Phase 3: DISCUSS ─────────────────────────────────────
// "Talk in external group chat"

describe("DISCUSS — group chat link", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
  });

  it("party with a group chat link makes it available to members", async () => {
    await insertParty(db, {
      id: "p1",
      leaderId: "leader",
      groupChatLink: "https://discord.gg/abc123",
    });
    const party = await getPartyWithGroupChatLink(db, "p1");
    expect(party?.groupChatLink).toBe("https://discord.gg/abc123");
  });

  it("party without a group chat link returns null", async () => {
    await insertParty(db, { id: "p2", leaderId: "leader" });
    const party = await getPartyWithGroupChatLink(db, "p2");
    expect(party?.groupChatLink).toBeNull();
  });
});

describe("DISCUSS — contested character detection", () => {
  let db: DrizzleD1Database;
  const PARTY = "p1";

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertUser(db, "carol");
    await insertUser(db, "dave");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
  });

  it("detects contested characters that need discussion", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "alice", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 7, userId: "bob", claimType: "conditional" });

    const slots = await resolveSlots(db, PARTY);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(1);
    expect(contested[0].characterId).toBe(7);
    expect(contested[0].conditionalBy.sort()).toEqual(["alice", "bob"]);
  });

  it("reports no contested characters when all are clean", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 1, userId: "alice", claimType: "claimed" });
    await insertClaim(db, { partyId: PARTY, characterId: 2, userId: "bob", claimType: "conditional" });

    const slots = await resolveSlots(db, PARTY);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(0);
  });

  it("multiple characters can be contested simultaneously", async () => {
    await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "alice", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 3, userId: "bob", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 8, userId: "carol", claimType: "conditional" });
    await insertClaim(db, { partyId: PARTY, characterId: 8, userId: "dave", claimType: "conditional" });

    const slots = await resolveSlots(db, PARTY);
    const contested = slots.filter((s) => s.state === "contested");
    expect(contested).toHaveLength(2);
    expect(contested.map((s) => s.characterId).sort()).toEqual([3, 8]);
  });
});
