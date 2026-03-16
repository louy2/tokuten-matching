import { eq, and, isNull, lte, asc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { events } from "../db/schema";
import type { EventType } from "./events";

interface ReplayMember {
  userId: string;
}

interface ReplayClaim {
  claimId: string;
  characterId: number;
  userId: string;
  claimType: string;
  rank: number | null;
}

export interface ReplayState {
  members: ReplayMember[];
  claims: ReplayClaim[];
}

/**
 * Replay non-undone events for a party up to a given timestamp,
 * reconstructing materialized state from the event stream.
 */
export async function replayPartyState(
  db: DrizzleD1Database,
  partyId: string,
  upTo?: Date,
): Promise<ReplayState> {
  const conditions = upTo
    ? and(eq(events.partyId, partyId), isNull(events.undoneAt), lte(events.createdAt, upTo))
    : and(eq(events.partyId, partyId), isNull(events.undoneAt));

  const rows = await db
    .select()
    .from(events)
    .where(conditions)
    .orderBy(asc(events.createdAt));

  const members: Map<string, ReplayMember> = new Map();
  const claims: Map<string, ReplayClaim> = new Map();

  for (const row of rows) {
    const type = row.type as EventType;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    switch (type) {
      case "member_joined": {
        const userId = payload.userId as string;
        members.set(userId, { userId });
        break;
      }

      case "claim_placed": {
        const claimId = payload.claimId as string;
        claims.set(claimId, {
          claimId,
          characterId: payload.characterId as number,
          userId: row.userId,
          claimType: payload.claimType as string,
          rank: (payload.rank as number | null) ?? null,
        });
        break;
      }

      case "claim_displaced": {
        const displacedClaimId = payload.displacedClaimId as string;
        claims.delete(displacedClaimId);
        break;
      }

      case "claim_promoted": {
        const claimId = payload.claimId as string;
        const existing = claims.get(claimId);
        if (existing) {
          existing.claimType = "claimed";
        }
        break;
      }

      case "party_locked":
      case "party_created":
        // No materialized state change for replay
        break;
    }
  }

  return {
    members: Array.from(members.values()),
    claims: Array.from(claims.values()),
  };
}
