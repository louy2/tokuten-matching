interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const cookie = context.request.headers.get("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (!sessionId) {
    return Response.json({ user: null });
  }

  const userId = await context.env.SESSIONS.get(`session:${sessionId}`);
  if (!userId) {
    return Response.json({ user: null });
  }

  const user = await context.env.DB.prepare(
    "SELECT id, display_name, avatar_url FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  return Response.json({ user: user ?? null });
};
