import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import type { Env } from "./env";
import { getDb } from "./db";

export interface SessionUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Extract the authenticated user from the session cookie, or return null. */
export async function getSessionUser(
  request: Request,
  env: Env,
): Promise<SessionUser | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];
  if (!sessionId) return null;

  const userId = await env.SESSIONS.get(`session:${sessionId}`);
  if (!userId) return null;

  const db = getDb(env.DB);
  const user = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return user ?? null;
}
