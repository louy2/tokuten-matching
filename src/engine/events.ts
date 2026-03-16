import { eq, and, isNull, desc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { events } from "../db/schema";
import { uuidv7 } from "../shared/uuidv7";

// ─── Event types ──────────────────────────────────────────

export type EventType =
  | "member_joined"
  | "claim_placed"
  | "claim_displaced"
  | "claim_promoted"
  | "party_created"
  | "party_locked";

export interface EventRow {
  id: string;
  partyId: string | null;
  userId: string;
  type: EventType;
  payload: Record<string, unknown>;
  undoneAt: Date | null;
  createdAt: Date;
}

// ─── Write ────────────────────────────────────────────────

export async function appendEvent(
  db: DrizzleD1Database,
  event: {
    partyId: string | null;
    userId: string;
    type: EventType;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const id = uuidv7();
  await db.insert(events).values({
    id,
    partyId: event.partyId,
    userId: event.userId,
    type: event.type,
    payload: JSON.stringify(event.payload),
    createdAt: new Date(),
  });
  return id;
}

// ─── Read ─────────────────────────────────────────────────

export async function getPartyEventLog(
  db: DrizzleD1Database,
  partyId: string,
  opts?: { includeUndone?: boolean; limit?: number },
): Promise<EventRow[]> {
  const limit = opts?.limit ?? 100;
  const includeUndone = opts?.includeUndone ?? false;

  let query = db
    .select()
    .from(events)
    .where(
      includeUndone
        ? eq(events.partyId, partyId)
        : and(eq(events.partyId, partyId), isNull(events.undoneAt)),
    )
    .orderBy(desc(events.createdAt))
    .limit(limit);

  const rows = await query;

  return rows.map((r) => ({
    id: r.id,
    partyId: r.partyId,
    userId: r.userId,
    type: r.type as EventType,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    undoneAt: r.undoneAt,
    createdAt: r.createdAt,
  }));
}
