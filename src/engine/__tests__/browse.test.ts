import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { listOpenParties } from "../parties";
import { setupDb, insertUser, insertParty, insertMember, insertClaim } from "./helpers";

// ─── Phase 1: BROWSE ──────────────────────────────────────
// "Find parties with open characters"

describe("BROWSE — find parties with open characters", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();

    // Seed users
    await insertUser(db, "leader-1");
    await insertUser(db, "leader-2");
    await insertUser(db, "leader-3");
    await insertUser(db, "leader-4");
    await insertUser(db, "leader-5");

    // p1: open, ja only, 5 members, 5 claimed
    await insertParty(db, { id: "p1", leaderId: "leader-1", languages: ["ja"], status: "open" });
    for (let i = 1; i <= 5; i++) {
      const uid = await insertUser(db, `p1-user-${i}`);
      await insertMember(db, "p1", uid);
      await insertClaim(db, { partyId: "p1", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p2: open, en only, 11 members, 11 claimed
    await insertParty(db, { id: "p2", leaderId: "leader-2", languages: ["en"], status: "open" });
    for (let i = 1; i <= 11; i++) {
      const uid = await insertUser(db, `p2-user-${i}`);
      await insertMember(db, "p2", uid);
      await insertClaim(db, { partyId: "p2", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p3: locked, ja, 12 members, 12 claimed
    await insertParty(db, { id: "p3", leaderId: "leader-3", languages: ["ja"], status: "locked" });
    for (let i = 1; i <= 12; i++) {
      const uid = await insertUser(db, `p3-user-${i}`);
      await insertMember(db, "p3", uid);
      await insertClaim(db, { partyId: "p3", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p4: open, zh only, 0 members, 0 claimed
    await insertParty(db, { id: "p4", leaderId: "leader-4", languages: ["zh"], status: "open" });

    // p5: open, multilingual ja+en, 0 members
    await insertParty(db, { id: "p5", leaderId: "leader-5", languages: ["ja", "en"], status: "open" });
  });

  it("returns only open parties by default", async () => {
    const result = await listOpenParties(db);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
    expect(ids).toContain("p4");
    expect(ids).toContain("p5");
    expect(ids).not.toContain("p3");
  });

  it("filters by language — matches single-language parties", async () => {
    const result = await listOpenParties(db, { language: "zh" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p4");
  });

  it("filters by language — matches multilingual parties", async () => {
    const result = await listOpenParties(db, { language: "ja" });
    const ids = result.map((p) => p.id);
    // p1 (ja) and p5 (ja+en) should both match
    expect(ids).toContain("p1");
    expect(ids).toContain("p5");
    expect(ids).not.toContain("p2"); // en only
  });

  it("multilingual party appears in results for each of its languages", async () => {
    const jaResults = await listOpenParties(db, { language: "ja" });
    const enResults = await listOpenParties(db, { language: "en" });
    expect(jaResults.map((p) => p.id)).toContain("p5");
    expect(enResults.map((p) => p.id)).toContain("p5");
  });

  it("excludes locked parties even if they match language", async () => {
    const result = await listOpenParties(db, { language: "ja" });
    expect(result.every((p) => p.status === "open")).toBe(true);
  });

  it("returns empty for a language with no open parties", async () => {
    const result = await listOpenParties(db, { language: "ko" });
    expect(result).toHaveLength(0);
  });

  it("shows member count and claimed count for each party", async () => {
    const result = await listOpenParties(db, { language: "en" });
    const p2 = result.find((p) => p.id === "p2")!;
    expect(p2.memberCount).toBe(11);
    expect(p2.claimedCount).toBe(11);
  });

  it("shows 0 members/claims for an empty party", async () => {
    const result = await listOpenParties(db, { language: "zh" });
    expect(result[0].memberCount).toBe(0);
    expect(result[0].claimedCount).toBe(0);
  });

  it("returns languages as an array", async () => {
    const result = await listOpenParties(db);
    const p5 = result.find((p) => p.id === "p5")!;
    expect(p5.languages).toEqual(["ja", "en"]);

    const p1 = result.find((p) => p.id === "p1")!;
    expect(p1.languages).toEqual(["ja"]);
  });
});
