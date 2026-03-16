import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { users } from "../db/schema";
import { buildEventInsert } from "./events";

// ─── Upsert (OAuth login) ─────────────────────────────────

export interface UpsertUserInput {
  displayName: string;
  avatarUrl: string | null;
  oauthProvider: string;
  oauthId: string;
}

export interface UpsertUserResult {
  userId: string;
  created: boolean;
  eventId: string;
}

/**
 * Find or create a user from OAuth profile data.
 * Emits user_created or user_profile_updated event.
 * All writes are batched atomically.
 */
export async function upsertUser(
  db: DrizzleD1Database,
  input: UpsertUserInput,
): Promise<UpsertUserResult> {
  const existing = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.oauthProvider, input.oauthProvider), eq(users.oauthId, input.oauthId)))
    .get();

  if (existing) {
    // Update profile if changed
    const changed =
      existing.displayName !== input.displayName ||
      existing.avatarUrl !== input.avatarUrl;

    const ev = buildEventInsert(db, {
      partyId: null,
      userId: existing.id,
      type: "user_profile_updated",
      payload: {
        userId: existing.id,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
    });

    if (changed) {
      await db.batch([
        db
          .update(users)
          .set({ displayName: input.displayName, avatarUrl: input.avatarUrl })
          .where(eq(users.id, existing.id)),
        ev.query,
      ]);
    } else {
      // No materialized change, but still record the event for audit
      await db.batch([ev.query]);
    }

    return { userId: existing.id, created: false, eventId: ev.id };
  }

  // New user
  const userId = crypto.randomUUID();
  const ev = buildEventInsert(db, {
    partyId: null,
    userId,
    type: "user_created",
    payload: {
      userId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      oauthProvider: input.oauthProvider,
      oauthId: input.oauthId,
    },
  });

  await db.batch([
    db.insert(users).values({
      id: userId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      oauthProvider: input.oauthProvider,
      oauthId: input.oauthId,
      createdAt: new Date(),
    }),
    ev.query,
  ]);

  return { userId, created: true, eventId: ev.id };
}
