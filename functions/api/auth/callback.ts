import type { Env } from "../_auth";

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Validate state parameter
  const cookie = context.request.headers.get("Cookie") ?? "";
  const savedState = cookie.match(/oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== savedState) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = context.env;

  // Exchange code for access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return new Response("Failed to exchange code for token", { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as DiscordTokenResponse;

  // Fetch Discord user profile
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return new Response("Failed to fetch Discord user", { status: 502 });
  }

  const discordUser = (await userRes.json()) as DiscordUser;

  // Find or create user in DB
  const existing = await context.env.DB.prepare(
    "SELECT id FROM users WHERE oauth_provider = 'discord' AND oauth_id = ?",
  )
    .bind(discordUser.id)
    .first<{ id: string }>();

  let userId: string;
  const displayName = discordUser.global_name ?? discordUser.username;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;

  if (existing) {
    userId = existing.id;
    // Update profile info on each login
    await context.env.DB.prepare(
      "UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?",
    )
      .bind(displayName, avatarUrl, userId)
      .run();
  } else {
    userId = crypto.randomUUID();
    await context.env.DB.prepare(
      "INSERT INTO users (id, display_name, avatar_url, oauth_provider, oauth_id, created_at) VALUES (?, ?, ?, 'discord', ?, ?)",
    )
      .bind(userId, displayName, avatarUrl, discordUser.id, Math.floor(Date.now() / 1000))
      .run();
  }

  // Create session
  const sessionId = crypto.randomUUID();
  await context.env.SESSIONS.put(`session:${sessionId}`, userId, {
    expirationTtl: 60 * 60 * 24 * 30, // 30 days
  });

  const response = new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });

  response.headers.append(
    "Set-Cookie",
    `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`,
  );

  // Clear the oauth_state cookie
  response.headers.append(
    "Set-Cookie",
    "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
  );

  return response;
};
