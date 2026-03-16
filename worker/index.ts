import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { Env } from "./env";
import { getSessionUser } from "./auth";
import { getDb } from "./db";
import { sendReminders } from "./reminders";
import {
  users,
  parties,
  partyMembers,
  characterClaims,
} from "../src/db/schema";

const app = new Hono<{ Bindings: Env }>();

// ─── Auth routes ────────────────────────────────────────────

app.get("/api/auth/me", async (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (!sessionId) return c.json({ user: null });

  const userId = await c.env.SESSIONS.get(`session:${sessionId}`);
  if (!userId) return c.json({ user: null });

  const db = getDb(c.env.DB);
  const user = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) return c.json({ user: null });

  return c.json({ user });
});

app.get("/api/auth/login", async (c) => {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: c.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/api/oauth2/authorize?${params}`,
      "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
    },
  });
});

app.get("/api/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  const cookie = c.req.header("Cookie") ?? "";
  const savedState = cookie.match(/oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== savedState) {
    return c.text("Invalid OAuth state", 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID,
      client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: c.env.DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) return c.text("Failed to exchange code for token", 502);

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch Discord user profile
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) return c.text("Failed to fetch Discord user", 502);

  const discord = (await userRes.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  const db = getDb(c.env.DB);

  // Find or create user
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.oauthProvider, "discord"), eq(users.oauthId, discord.id)))
    .get();

  const displayName = discord.global_name ?? discord.username;
  const avatarUrl = discord.avatar
    ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png`
    : null;

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({ displayName, avatarUrl })
      .where(eq(users.id, userId));
  } else {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      avatarUrl,
      oauthProvider: "discord",
      oauthId: discord.id,
      createdAt: new Date(),
    });
  }

  // Create session
  const sessionId = crypto.randomUUID();
  await c.env.SESSIONS.put(`session:${sessionId}`, userId, {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  const response = new Response(null, {
    status: 302,
    headers: { Location: "/profile" },
  });
  response.headers.append(
    "Set-Cookie",
    `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`,
  );
  response.headers.append(
    "Set-Cookie",
    "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
  );
  return response;
});

app.get("/api/auth/logout", async (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (sessionId) {
    await c.env.SESSIONS.delete(`session:${sessionId}`);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
    },
  });
});

// ─── Party routes ───────────────────────────────────────────

app.get("/api/parties", async (c) => {
  const language = c.req.query("language");
  const db = getDb(c.env.DB);

  const partyIdRef = sql.raw('"parties"."id"');
  const memberCountSq = sql<number>`(SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = ${partyIdRef})`.as("memberCount");
  const claimedCountSq = sql<number>`(SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCount");

  let query = db
    .select({
      id: parties.id,
      name: parties.name,
      languages: parties.languages,
      createdAt: parties.createdAt,
      memberCount: memberCountSq,
      claimedCount: claimedCountSq,
    })
    .from(parties)
    .where(
      language
        ? and(
            eq(parties.status, "open"),
            sql`EXISTS (SELECT 1 FROM json_each(${parties.languages}) WHERE json_each.value = ${language})`,
          )
        : eq(parties.status, "open"),
    )
    .orderBy(sql`${parties.createdAt} DESC`);

  const rows = await query;
  return c.json({ parties: rows });
});

app.get("/api/parties/:partyId", async (c) => {
  const partyId = c.req.param("partyId");
  const db = getDb(c.env.DB);

  const [party, members, claims] = await Promise.all([
    db.select().from(parties).where(eq(parties.id, partyId)).get(),
    db
      .select({
        userId: partyMembers.userId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        joinedAt: partyMembers.joinedAt,
      })
      .from(partyMembers)
      .innerJoin(users, eq(users.id, partyMembers.userId))
      .where(eq(partyMembers.partyId, partyId)),
    db
      .select({
        characterId: characterClaims.characterId,
        userId: characterClaims.userId,
        displayName: users.displayName,
        claimType: characterClaims.claimType,
        rank: characterClaims.rank,
      })
      .from(characterClaims)
      .innerJoin(users, eq(users.id, characterClaims.userId))
      .where(eq(characterClaims.partyId, partyId)),
  ]);

  if (!party) return c.json({ error: "Party not found" }, 404);

  return c.json({
    ...party,
    members,
    claims,
  });
});

app.post("/api/parties/create", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{
    name: string;
    languages: string[];
    description?: string;
    groupChatLink?: string;
  }>();

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: "Name is required" }, 400);
  }
  if (!body.languages || body.languages.length === 0) {
    return c.json({ error: "At least one language is required" }, 400);
  }

  const db = getDb(c.env.DB);
  const partyId = crypto.randomUUID();
  const now = new Date();

  await db.insert(parties).values({
    id: partyId,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    leaderId: user.id,
    status: "open",
    groupChatLink: body.groupChatLink?.trim() || null,
    languages: JSON.stringify(body.languages),
    autoPromoteDate: "2026-05-08",
    createdAt: now,
  });

  await db.insert(partyMembers).values({
    partyId,
    userId: user.id,
    joinedAt: now,
  });

  return c.json({ ok: true, partyId });
});

app.post("/api/parties/:partyId/join", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = getDb(c.env.DB);

  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return c.json({ error: "Party not found" }, 404);
  if (party.status === "locked") return c.json({ error: "party_locked" }, 409);

  const existing = await db
    .select({ partyId: partyMembers.partyId })
    .from(partyMembers)
    .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, user.id)))
    .get();

  if (existing) return c.json({ error: "already_a_member" }, 409);

  await db.insert(partyMembers).values({
    partyId,
    userId: user.id,
    joinedAt: new Date(),
  });

  return c.json({ ok: true });
});

app.post("/api/parties/:partyId/claims", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = getDb(c.env.DB);

  const body = await c.req.json<{
    characterId: number;
    claimType: "preference" | "conditional" | "claimed";
    rank?: number | null;
  }>();

  const { characterId, claimType, rank } = body;

  if (!Number.isInteger(characterId) || characterId < 1 || characterId > 12) {
    return c.json({ error: "invalid_character" }, 400);
  }

  const party = await db
    .select({ status: parties.status })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return c.json({ error: "Party not found" }, 404);
  if (party.status === "locked") return c.json({ error: "party_locked" }, 409);

  const member = await db
    .select({ partyId: partyMembers.partyId })
    .from(partyMembers)
    .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, user.id)))
    .get();

  if (!member) return c.json({ error: "not_a_member" }, 403);

  if (claimType === "claimed") {
    const existingUserClaim = await db
      .select({ id: characterClaims.id })
      .from(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.userId, user.id),
          eq(characterClaims.claimType, "claimed"),
        ),
      )
      .get();
    if (existingUserClaim) return c.json({ error: "user_already_claimed_another" }, 409);

    const existingCharClaim = await db
      .select({ id: characterClaims.id })
      .from(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.characterId, characterId),
          eq(characterClaims.claimType, "claimed"),
        ),
      )
      .get();
    if (existingCharClaim) return c.json({ error: "character_already_claimed" }, 409);

    await db
      .delete(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.characterId, characterId),
          eq(characterClaims.claimType, "conditional"),
        ),
      );
  }

  if (claimType === "conditional") {
    const existingCond = await db
      .select({ id: characterClaims.id })
      .from(characterClaims)
      .where(
        and(
          eq(characterClaims.partyId, partyId),
          eq(characterClaims.characterId, characterId),
          eq(characterClaims.claimType, "conditional"),
        ),
      )
      .get();
    if (existingCond) return c.json({ error: "character_already_has_conditional" }, 409);
  }

  const claimId = crypto.randomUUID();
  await db.insert(characterClaims).values({
    id: claimId,
    partyId,
    characterId,
    userId: user.id,
    claimType,
    rank: rank ?? null,
    createdAt: new Date(),
  });

  return c.json({ ok: true, claimId });
});

// ─── My parties ─────────────────────────────────────────────

app.get("/api/my-parties", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ parties: [] });

  const db = getDb(c.env.DB);

  const partyIdRef = sql.raw('"parties"."id"');
  const memberCountSq = sql<number>`(SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = ${partyIdRef})`.as("memberCount");
  const claimedCountSq = sql<number>`(SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCount");

  const rows = await db
    .select({
      id: parties.id,
      name: parties.name,
      status: parties.status,
      languages: parties.languages,
      leaderId: parties.leaderId,
      createdAt: parties.createdAt,
      memberCount: memberCountSq,
      claimedCount: claimedCountSq,
    })
    .from(parties)
    .innerJoin(partyMembers, eq(partyMembers.partyId, parties.id))
    .where(eq(partyMembers.userId, user.id))
    .orderBy(sql`${parties.createdAt} DESC`);

  return c.json({ parties: rows });
});

// ─── SPA fallback: serve static assets via Workers Sites ────

// For non-API routes, return the SPA shell.
// Static assets (JS, CSS, images) are served by Cloudflare's
// asset binding configured in wrangler.toml.
app.get("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.all("/api/*", (c) => c.json({ error: "Method not allowed" }, 405));

// Serve static assets / SPA fallback for all non-API routes
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// ─── Export ─────────────────────────────────────────────────

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(sendReminders(env));
  },
};
