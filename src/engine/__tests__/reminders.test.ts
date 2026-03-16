import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { setupDb, insertUser, insertParty, insertMember, insertClaim } from "./helpers";
import { sendReminders } from "../../../worker/reminders";
import type { DrizzleD1Database } from "drizzle-orm/d1";

/** Build a fake Env from the test bindings plus a fake bot token. */
function makeEnv() {
  return {
    ...env,
    DISCORD_CLIENT_ID: "fake-client-id",
    DISCORD_CLIENT_SECRET: "fake-client-secret",
    DISCORD_REDIRECT_URI: "http://localhost/callback",
    DISCORD_BOT_TOKEN: "fake-bot-token",
  };
}

/** Return an auto_promote_date string N days from now (JST). */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // Format as YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

/** Stub fetch to simulate successful Discord DM sends. */
function stubFetchSuccess() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/users/@me/channels")) {
      return Response.json({ id: "dm-channel-123" });
    }
    if (url.includes("/channels/dm-channel-123/messages")) {
      return Response.json({ id: "msg-1" });
    }
    return new Response("Not found", { status: 404 });
  });
}

describe("sendReminders", () => {
  let db: DrizzleD1Database;

  beforeEach(async () => {
    db = await setupDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a reminder when party is at a milestone day", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader");
    const partyId = await insertParty(db, {
      leaderId,
      autoPromoteDate: daysFromNow(14),
    });
    await insertMember(db, partyId, leaderId);

    const result = await sendReminders(makeEnv());

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(fetchSpy).toHaveBeenCalled();

    // Verify KV flag was set
    const kvVal = await env.SESSIONS.get(`reminder:${partyId}:14`);
    expect(kvVal).toBe("1");
  });

  it("skips parties not at a milestone day", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader");
    await insertParty(db, {
      leaderId,
      autoPromoteDate: daysFromNow(10), // not a milestone
    });

    const result = await sendReminders(makeEnv());

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips if reminder was already sent (KV flag exists)", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader");
    const partyId = await insertParty(db, {
      leaderId,
      autoPromoteDate: daysFromNow(14),
    });
    await insertMember(db, partyId, leaderId);

    // Pre-set the KV flag
    await env.SESSIONS.put(`reminder:${partyId}:14`, "1");

    const result = await sendReminders(makeEnv());

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips if leader is not a Discord user", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader", {
      oauthProvider: "other",
    });
    await insertParty(db, {
      leaderId,
      autoPromoteDate: daysFromNow(14),
    });

    const result = await sendReminders(makeEnv());

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips if Discord API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const leaderId = await insertUser(db, "leader-fail", "Leader");
    const partyId = await insertParty(db, {
      id: "party-fail",
      leaderId,
      autoPromoteDate: daysFromNow(14),
    });
    await insertMember(db, partyId, leaderId);

    const result = await sendReminders(makeEnv());

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);

    // KV flag should NOT be set
    const kvVal = await env.SESSIONS.get(`reminder:party-fail:14`);
    expect(kvVal).toBeNull();
  });

  it("sends day-0 message with correct content", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader");
    const partyId = await insertParty(db, {
      name: "My Party",
      leaderId,
      autoPromoteDate: daysFromNow(0),
    });
    await insertMember(db, partyId, leaderId);

    // Add a claimed character
    await insertClaim(db, {
      partyId,
      characterId: 1,
      userId: leaderId,
      claimType: "claimed",
    });

    await sendReminders(makeEnv());

    // Find the message send call
    const msgCall = fetchSpy.mock.calls.find(
      ([input]) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        return url.includes("/messages");
      },
    );
    expect(msgCall).toBeDefined();

    const body = JSON.parse((msgCall![1] as RequestInit).body as string);
    expect(body.content).toContain("Auto-promote day");
    expect(body.content).toContain("My Party");
    expect(body.content).toContain("1 claimed");
  });

  it("includes contested count in non-zero-day message", async () => {
    const fetchSpy = stubFetchSuccess();

    const leaderId = await insertUser(db, "leader-1", "Leader");
    const user2 = await insertUser(db, "user-2", "User 2");
    const partyId = await insertParty(db, {
      leaderId,
      autoPromoteDate: daysFromNow(3),
    });
    await insertMember(db, partyId, leaderId);
    await insertMember(db, partyId, user2);

    // Two conditionals on the same character = contested
    await insertClaim(db, { partyId, characterId: 1, userId: leaderId, claimType: "conditional" });
    await insertClaim(db, { partyId, characterId: 1, userId: user2, claimType: "conditional" });

    await sendReminders(makeEnv());

    const msgCall = fetchSpy.mock.calls.find(
      ([input]) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        return url.includes("/messages");
      },
    );
    const body = JSON.parse((msgCall![1] as RequestInit).body as string);
    expect(body.content).toContain("1 contested");
    expect(body.content).toContain("still need to be resolved");
  });
});
