import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { events, characterClaims, partyMembers } from "../db/schema";
import type { EventType } from "./events";

const UNDO_WINDOW_MS = 30_000; // 30 seconds

export type UndoError =
  | "not_found"
  | "not_yours"
  | "already_undone"
  | "expired"
  | "not_undoable";

/**
 * Undo a recent event within the 30-second window.
 * Reverses the materialized state change and marks the event as undone.
 * All writes are batched atomically.
 */
export async function undoEvent(
  db: DrizzleD1Database,
  eventId: string,
  requestingUserId: string,
): Promise<"ok" | UndoError> {
  // Read phase: validate and gather context
  const row = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .get();

  if (!row) return "not_found";
  if (row.userId !== requestingUserId) return "not_yours";
  if (row.undoneAt) return "already_undone";

  const elapsed = Date.now() - row.createdAt.getTime();
  if (elapsed > UNDO_WINDOW_MS) return "expired";

  const type = row.type as EventType;
  const payload = JSON.parse(row.payload) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writes: any[] = [];

  switch (type) {
    case "claim_placed": {
      // Delete the claim from materialized table
      const claimId = payload.claimId as string;
      writes.push(db.delete(characterClaims).where(eq(characterClaims.id, claimId)));

      // Restore any displaced conditionals
      const displacedEvents = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.partyId, row.partyId!),
            eq(events.type, "claim_displaced"),
          ),
        );

      for (const de of displacedEvents) {
        const dp = JSON.parse(de.payload) as Record<string, unknown>;
        if (dp.byUserId === requestingUserId && dp.characterId === payload.characterId) {
          // Restore the displaced conditional claim
          writes.push(
            db.insert(characterClaims).values({
              id: dp.displacedClaimId as string,
              partyId: row.partyId!,
              characterId: dp.characterId as number,
              userId: dp.displacedUserId as string,
              claimType: "conditional",
              rank: null,
              createdAt: new Date(),
            }),
          );
          // Mark the displacement event as undone too
          writes.push(
            db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, de.id)),
          );
        }
      }
      break;
    }

    case "member_joined": {
      const partyId = payload.partyId as string;
      const userId = payload.userId as string;
      writes.push(
        db.delete(partyMembers).where(
          and(
            eq(partyMembers.partyId, partyId),
            eq(partyMembers.userId, userId),
          ),
        ),
      );
      break;
    }

    case "claim_cancelled": {
      // Restore the cancelled claim
      const claimId = payload.claimId as string;
      const characterId = payload.characterId as number;
      const claimType = payload.claimType as string;
      writes.push(
        db.insert(characterClaims).values({
          id: claimId,
          partyId: row.partyId!,
          characterId,
          userId: requestingUserId,
          claimType,
          rank: null,
          createdAt: new Date(),
        }),
      );
      break;
    }

    case "claim_displaced":
    case "claim_promoted":
    case "party_created":
    case "party_locked":
      return "not_undoable";

    default:
      return "not_undoable";
  }

  // Mark the event itself as undone
  writes.push(
    db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, eventId)),
  );

  // Atomic write: all materialized changes + event marking
  await db.batch(writes as [typeof writes[0], ...typeof writes]);

  return "ok";
}
