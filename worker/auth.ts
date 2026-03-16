import type { Env } from "./env";

/** Extract the authenticated user from the session cookie, or return null. */
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
