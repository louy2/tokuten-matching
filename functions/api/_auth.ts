/** Shared auth helper for API routes */
export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
}

export async function getSessionUser(
  request: Request,
  env: Env,
): Promise<{ id: string; display_name: string; avatar_url: string | null } | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];
  if (!sessionId) return null;

  const userId = await env.SESSIONS.get(`session:${sessionId}`);
  if (!userId) return null;

  const user = await env.DB.prepare(
    "SELECT id, display_name, avatar_url FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{ id: string; display_name: string; avatar_url: string | null }>();

  return user ?? null;
}
