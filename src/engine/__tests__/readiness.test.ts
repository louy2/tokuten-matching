import { describe, it, expect, beforeEach } from "vitest";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { initiateReadinessCheck, respondToReadinessCheck, getReadinessStatus } from "../readiness";
import { setupDb, insertUser, insertParty, insertMember } from "./helpers";

const PARTY = "p1";

describe("Readiness check — leader pings members", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
    await insertUser(db, "leader");
    await insertUser(db, "alice");
    await insertUser(db, "bob");
    await insertUser(db, "carol");
    await insertParty(db, { id: PARTY, leaderId: "leader" });
    await insertMember(db, PARTY, "leader");
    await insertMember(db, PARTY, "alice");
    await insertMember(db, PARTY, "bob");
    await insertMember(db, PARTY, "carol");
  });

  it("leader can initiate a readiness check", async () => {
    const result = await initiateReadinessCheck(db, PARTY, "leader");
    expect(result).toHaveProperty("checkId");
    expect(result).not.toHaveProperty("error");
  });

  it("non-leader cannot initiate a readiness check", async () => {
    const result = await initiateReadinessCheck(db, PARTY, "alice");
    expect(result).toEqual({ error: "not_leader" });
  });

  it("after initiation, all members except leader are pending", async () => {
    const result = await initiateReadinessCheck(db, PARTY, "leader");
    const checkId = (result as { checkId: string }).checkId;

    const status = await getReadinessStatus(db, PARTY, checkId);
    expect(status.responded).toHaveLength(0);
    expect(status.pending.sort()).toEqual(["alice", "bob", "carol"]);
  });

  it("members can respond 'still in'", async () => {
    const result = await initiateReadinessCheck(db, PARTY, "leader");
    const checkId = (result as { checkId: string }).checkId;

    const resp = await respondToReadinessCheck(db, PARTY, checkId, "alice", true);
    expect(resp).not.toHaveProperty("error");

    const status = await getReadinessStatus(db, PARTY, checkId);
    expect(status.responded).toContainEqual({ userId: "alice", stillIn: true });
    expect(status.pending.sort()).toEqual(["bob", "carol"]);
  });

  it("members can respond 'dropping out'", async () => {
    const result = await initiateReadinessCheck(db, PARTY, "leader");
    const checkId = (result as { checkId: string }).checkId;

    await respondToReadinessCheck(db, PARTY, checkId, "bob", false);

    const status = await getReadinessStatus(db, PARTY, checkId);
    expect(status.responded).toContainEqual({ userId: "bob", stillIn: false });
  });

  it("non-member cannot respond", async () => {
    await insertUser(db, "outsider");
    const result = await initiateReadinessCheck(db, PARTY, "leader");
    const checkId = (result as { checkId: string }).checkId;

    const resp = await respondToReadinessCheck(db, PARTY, checkId, "outsider", true);
    expect(resp).toEqual({ error: "not_a_member" });
  });

  it("cannot respond to invalid check", async () => {
    const resp = await respondToReadinessCheck(db, PARTY, "nonexistent", "alice", true);
    expect(resp).toEqual({ error: "check_not_found" });
  });
});
