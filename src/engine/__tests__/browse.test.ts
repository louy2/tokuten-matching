import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { env } from "cloudflare:test";
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

    // p1: open, ja, 5 members, 5 claimed
    await insertParty(db, { id: "p1", leaderId: "leader-1", language: "ja", status: "open" });
    for (let i = 1; i <= 5; i++) {
      const uid = await insertUser(db, `p1-user-${i}`);
      await insertMember(db, "p1", uid);
      await insertClaim(db, { partyId: "p1", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p2: open, en, 11 members, 11 claimed
    await insertParty(db, { id: "p2", leaderId: "leader-2", language: "en", status: "open" });
    for (let i = 1; i <= 11; i++) {
      const uid = await insertUser(db, `p2-user-${i}`);
      await insertMember(db, "p2", uid);
      await insertClaim(db, { partyId: "p2", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p3: locked, ja, 12 members, 12 claimed
    await insertParty(db, { id: "p3", leaderId: "leader-3", language: "ja", status: "locked" });
    for (let i = 1; i <= 12; i++) {
      const uid = await insertUser(db, `p3-user-${i}`);
      await insertMember(db, "p3", uid);
      await insertClaim(db, { partyId: "p3", characterId: i, userId: uid, claimType: "claimed" });
    }

    // p4: open, zh, 0 members, 0 claimed
    await insertParty(db, { id: "p4", leaderId: "leader-4", language: "zh", status: "open" });
  });

  it("returns only open parties by default", async () => {
    const result = await listOpenParties(env.DB);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
    expect(ids).toContain("p4");
    expect(ids).not.toContain("p3");
  });

  it("filters by language", async () => {
    const result = await listOpenParties(env.DB, { language: "ja" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });

  it("excludes locked parties even if they match language", async () => {
    const result = await listOpenParties(env.DB, { language: "ja" });
    expect(result.every((p) => p.status === "open")).toBe(true);
  });

  it("returns empty for a language with no open parties", async () => {
    const result = await listOpenParties(env.DB, { language: "ko" });
    expect(result).toHaveLength(0);
  });

  it("shows member count and claimed count for each party", async () => {
    const result = await listOpenParties(env.DB, { language: "en" });
    expect(result[0].memberCount).toBe(11);
    expect(result[0].claimedCount).toBe(11);
  });

  it("shows 0 members/claims for an empty party", async () => {
    const result = await listOpenParties(env.DB, { language: "zh" });
    expect(result[0].memberCount).toBe(0);
    expect(result[0].claimedCount).toBe(0);
  });
});
