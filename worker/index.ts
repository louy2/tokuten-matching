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
import { validateClaim, placeClaim, cancelClaim } from "../src/engine/claims";
import { buildEventInsert } from "../src/engine/events";
import { createParty, joinParty } from "../src/engine/parties";
import { upsertUser } from "../src/engine/users";
import { authErrorPage } from "./auth-error-page";

const app = new Hono<{ Bindings: Env }>();

// ─── Request logging middleware ─────────────────────────────

app.use("/api/*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const ua = c.req.header("User-Agent") ?? "unknown";

  console.log(JSON.stringify({
    event: "request_start",
    method,
    path,
    ua: ua.slice(0, 120),
  }));

  await next();

  const duration = Date.now() - start;
  console.log(JSON.stringify({
    event: "request_end",
    method,
    path,
    status: c.res.status,
    duration_ms: duration,
  }));
});

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
      characterPreferences: users.characterPreferences,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) return c.json({ user: null });

  return c.json({
    user: {
      ...user,
      characterPreferences: JSON.parse(user.characterPreferences ?? "[]"),
    },
  });
});

app.get("/api/auth/login", async (c) => {
  const state = crypto.randomUUID();

  console.log(JSON.stringify({
    event: "login_start",
    ua: (c.req.header("User-Agent") ?? "").slice(0, 120),
  }));

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
  const errorParam = c.req.query("error");

  // Discord may redirect back with an error (e.g., access_denied)
  if (errorParam) {
    console.log(JSON.stringify({
      event: "oauth_callback_error",
      error: errorParam,
      error_description: c.req.query("error_description"),
    }));
    return authErrorPage(
      "Login cancelled",
      `Discord returned: ${errorParam}. Please try again.`,
      400,
    );
  }

  const cookie = c.req.header("Cookie") ?? "";
  const savedState = cookie.match(/oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== savedState) {
    console.log(JSON.stringify({
      event: "oauth_state_mismatch",
      hasCode: !!code,
      hasState: !!state,
      hasSavedState: !!savedState,
      cookieHeader: cookie ? "present" : "missing",
    }));
    return authErrorPage(
      "Login failed",
      "Session state mismatch — your browser may be blocking cookies. If using Brave, try disabling Shields for this site.",
      400,
    );
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

  if (!tokenRes.ok) {
    console.log(JSON.stringify({
      event: "oauth_token_exchange_failed",
      status: tokenRes.status,
    }));
    return authErrorPage(
      "Login failed",
      "Could not complete Discord authentication. Please try again.",
      502,
    );
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch Discord user profile
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    console.log(JSON.stringify({
      event: "discord_user_fetch_failed",
      status: userRes.status,
    }));
    return authErrorPage(
      "Login failed",
      "Could not fetch your Discord profile. Please try again.",
      502,
    );
  }

  const discord = (await userRes.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  const db = getDb(c.env.DB);

  const displayName = discord.global_name ?? discord.username;
  const avatarUrl = discord.avatar
    ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png`
    : null;

  const { userId } = await upsertUser(db, {
    displayName,
    avatarUrl,
    oauthProvider: "discord",
    oauthId: discord.id,
  });

  // Create session
  const sessionId = crypto.randomUUID();
  await c.env.SESSIONS.put(`session:${sessionId}`, userId, {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  console.log(JSON.stringify({
    event: "login_success",
    userId,
    ua: (c.req.header("User-Agent") ?? "").slice(0, 120),
  }));

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

// ─── Profile routes ─────────────────────────────────────────

app.put("/api/profile", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{
    characterPreferences?: number[];
  }>();

  const db = getDb(c.env.DB);

  if (body.characterPreferences !== undefined) {
    const prefs = body.characterPreferences;
    // Validate: must be array of unique character IDs 1-12
    if (
      !Array.isArray(prefs) ||
      prefs.some((id) => !Number.isInteger(id) || id < 1 || id > 12) ||
      new Set(prefs).size !== prefs.length
    ) {
      return c.json({ error: "Invalid character preferences" }, 400);
    }

    const ev = buildEventInsert(db, {
      partyId: null,
      userId: user.id,
      type: "user_profile_updated",
      payload: {
        userId: user.id,
        characterPreferences: prefs,
      },
    });

    await db.batch([
      db
        .update(users)
        .set({ characterPreferences: JSON.stringify(prefs) })
        .where(eq(users.id, user.id)),
      ev.query,
    ]);
  }

  return c.json({ ok: true });
});

// ─── Party routes ───────────────────────────────────────────

app.get("/api/parties", async (c) => {
  const language = c.req.query("language");
  const db = getDb(c.env.DB);

  const partyIdRef = sql.raw('"parties"."id"');
  const memberCountSq = sql<number>`(SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = ${partyIdRef})`.as("memberCount");
  const claimedCountSq = sql<number>`(SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCount");
  const claimedCharacterIdsSq = sql<string>`(SELECT '[' || GROUP_CONCAT(cc.character_id) || ']' FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCharacterIds");

  let query = db
    .select({
      id: parties.id,
      name: parties.name,
      languages: parties.languages,
      createdAt: parties.createdAt,
      memberCount: memberCountSq,
      claimedCount: claimedCountSq,
      claimedCharacterIds: claimedCharacterIdsSq,
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
        characterPreferences: users.characterPreferences,
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
    members: members.map((m) => ({
      ...m,
      characterPreferences: JSON.parse(m.characterPreferences ?? "[]"),
    })),
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
  const result = await createParty(db, {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    leaderId: user.id,
    languages: body.languages,
    groupChatLink: body.groupChatLink?.trim() || null,
  });

  return c.json({ ok: true, partyId: result.partyId });
});

app.post("/api/parties/:partyId/join", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = getDb(c.env.DB);

  const result = await joinParty(db, partyId, user.id);

  if (result.error) {
    const statusMap: Record<string, number> = {
      party_not_found: 404,
      party_locked: 409,
      already_a_member: 409,
    };
    return c.json({ error: result.error }, statusMap[result.error] as 404 ?? 400);
  }

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

  const error = await validateClaim(db, partyId, {
    userId: user.id,
    characterId,
    claimType,
  });

  if (error) {
    const status = error === "not_a_member" ? 403
      : error === "invalid_character" ? 400
      : 409;
    return c.json({ error }, status);
  }

  const result = await placeClaim(db, partyId, {
    id: crypto.randomUUID(),
    userId: user.id,
    characterId,
    claimType,
    rank: rank ?? null,
  });

  return c.json({ ok: true, claimId: result.claimId });
});

app.delete("/api/parties/:partyId/claims", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = getDb(c.env.DB);

  const body = await c.req.json<{
    characterId: number;
    claimType: "conditional" | "claimed";
  }>();

  const { characterId, claimType } = body;

  if (!Number.isInteger(characterId) || characterId < 1 || characterId > 12) {
    return c.json({ error: "invalid_character" }, 400);
  }

  if (claimType !== "conditional" && claimType !== "claimed") {
    return c.json({ error: "invalid_claim_type" }, 400);
  }

  const result = await cancelClaim(db, partyId, user.id, characterId, claimType);

  if ("error" in result) {
    const statusMap: Record<string, number> = {
      party_locked: 409,
      not_a_member: 403,
      claim_not_found: 404,
    };
    return c.json({ error: result.error }, statusMap[result.error] as 409 ?? 400);
  }

  return c.json({ ok: true });
});

// ─── My parties ─────────────────────────────────────────────

app.get("/api/my-parties", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ parties: [] });

  const db = getDb(c.env.DB);

  const partyIdRef = sql.raw('"parties"."id"');
  const memberCountSq = sql<number>`(SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = ${partyIdRef})`.as("memberCount");
  const claimedCountSq = sql<number>`(SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCount");
  const claimedCharacterIdsSq = sql<string>`(SELECT '[' || GROUP_CONCAT(cc.character_id) || ']' FROM character_claims cc WHERE cc.party_id = ${partyIdRef} AND cc.claim_type = 'claimed')`.as("claimedCharacterIds");

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
      claimedCharacterIds: claimedCharacterIdsSq,
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
