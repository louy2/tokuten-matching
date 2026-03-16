import { Hono } from "hono";
import type { Env } from "./env";
import { getSessionUser } from "./auth";
import { sendReminders } from "./reminders";

const app = new Hono<{ Bindings: Env }>();

// ─── Auth routes ────────────────────────────────────────────

app.get("/api/auth/me", async (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (!sessionId) return c.json({ user: null });

  const userId = await c.env.SESSIONS.get(`session:${sessionId}`);
  if (!userId) return c.json({ user: null });

  const user = await c.env.DB.prepare(
    "SELECT id, display_name, avatar_url FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  return c.json({ user: user ?? null });
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

  // Find or create user
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE oauth_provider = 'discord' AND oauth_id = ?",
  )
    .bind(discord.id)
    .first<{ id: string }>();

  const displayName = discord.global_name ?? discord.username;
  const avatarUrl = discord.avatar
    ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png`
    : null;

  let userId: string;
  if (existing) {
    userId = existing.id;
    await c.env.DB.prepare(
      "UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?",
    )
      .bind(displayName, avatarUrl, userId)
      .run();
  } else {
    userId = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO users (id, display_name, avatar_url, oauth_provider, oauth_id, created_at) VALUES (?, ?, ?, 'discord', ?, ?)",
    )
      .bind(userId, displayName, avatarUrl, discord.id, Math.floor(Date.now() / 1000))
      .run();
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

  let query = `
    SELECT
      p.id, p.name, p.languages, p.created_at,
      COUNT(DISTINCT pm.user_id) as member_count
    FROM parties p
    LEFT JOIN party_members pm ON pm.party_id = p.id
    WHERE p.status = 'open'
  `;
  const params: string[] = [];

  if (language) {
    query +=
      " AND EXISTS (SELECT 1 FROM json_each(p.languages) WHERE json_each.value = ?)";
    params.push(language);
  }

  query += " GROUP BY p.id ORDER BY p.created_at DESC";

  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ parties: result.results });
});

app.get("/api/parties/:partyId", async (c) => {
  const partyId = c.req.param("partyId");

  const [party, members, claims] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM parties WHERE id = ?")
      .bind(partyId)
      .first(),
    c.env.DB.prepare(
      `SELECT pm.user_id, u.display_name, u.avatar_url, pm.joined_at
       FROM party_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.party_id = ?`,
    )
      .bind(partyId)
      .all(),
    c.env.DB.prepare(
      `SELECT cc.character_id, cc.user_id, u.display_name, cc.claim_type, cc.rank
       FROM character_claims cc
       JOIN users u ON u.id = cc.user_id
       WHERE cc.party_id = ?`,
    )
      .bind(partyId)
      .all(),
  ]);

  if (!party) return c.json({ error: "Party not found" }, 404);

  return c.json({
    ...party,
    members: members.results,
    claims: claims.results,
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

  const partyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO parties (id, name, description, leader_id, status, group_chat_link, languages, auto_promote_date, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, '2026-05-08', ?)`,
  )
    .bind(
      partyId,
      body.name.trim(),
      body.description?.trim() || null,
      user.id,
      body.groupChatLink?.trim() || null,
      JSON.stringify(body.languages),
      now,
    )
    .run();

  await c.env.DB.prepare(
    "INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)",
  )
    .bind(partyId, user.id, now)
    .run();

  return c.json({ ok: true, partyId });
});

app.post("/api/parties/:partyId/join", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = c.env.DB;

  const party = await db
    .prepare("SELECT status FROM parties WHERE id = ?")
    .bind(partyId)
    .first<{ status: string }>();

  if (!party) return c.json({ error: "Party not found" }, 404);
  if (party.status === "locked") return c.json({ error: "party_locked" }, 409);

  const existing = await db
    .prepare("SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?")
    .bind(partyId, user.id)
    .first();

  if (existing) return c.json({ error: "already_a_member" }, 409);

  await db
    .prepare("INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(partyId, user.id, Math.floor(Date.now() / 1000))
    .run();

  return c.json({ ok: true });
});

app.post("/api/parties/:partyId/claims", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const partyId = c.req.param("partyId");
  const db = c.env.DB;

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
    .prepare("SELECT status FROM parties WHERE id = ?")
    .bind(partyId)
    .first<{ status: string }>();

  if (!party) return c.json({ error: "Party not found" }, 404);
  if (party.status === "locked") return c.json({ error: "party_locked" }, 409);

  const member = await db
    .prepare("SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?")
    .bind(partyId, user.id)
    .first();

  if (!member) return c.json({ error: "not_a_member" }, 403);

  if (claimType === "claimed") {
    const existingUserClaim = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND user_id = ? AND claim_type = 'claimed'",
      )
      .bind(partyId, user.id)
      .first();
    if (existingUserClaim) return c.json({ error: "user_already_claimed_another" }, 409);

    const existingCharClaim = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'claimed'",
      )
      .bind(partyId, characterId)
      .first();
    if (existingCharClaim) return c.json({ error: "character_already_claimed" }, 409);

    await db
      .prepare(
        "DELETE FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'conditional'",
      )
      .bind(partyId, characterId)
      .run();
  }

  if (claimType === "conditional") {
    const existingCond = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'conditional'",
      )
      .bind(partyId, characterId)
      .first();
    if (existingCond) return c.json({ error: "character_already_has_conditional" }, 409);
  }

  const claimId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO character_claims (id, party_id, character_id, user_id, claim_type, rank, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(claimId, partyId, characterId, user.id, claimType, rank ?? null, Math.floor(Date.now() / 1000))
    .run();

  return c.json({ ok: true, claimId });
});

// ─── My parties ─────────────────────────────────────────────

app.get("/api/my-parties", async (c) => {
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ parties: [] });

  const result = await c.env.DB.prepare(
    `SELECT
       p.id, p.name, p.status, p.languages, p.leader_id, p.created_at,
       (SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = p.id AND cc.claim_type = 'claimed') AS claimed_count
     FROM parties p
     JOIN party_members pm ON pm.party_id = p.id
     WHERE pm.user_id = ?
     ORDER BY p.created_at DESC`,
  )
    .bind(user.id)
    .all();

  return c.json({ parties: result.results });
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
