import { eq, and, isNull, lte, asc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { events, characterClaims, partyMembers } from "../db/schema";
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

      case "claim_cancelled": {
        const claimId = payload.claimId as string;
        claims.delete(claimId);
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

// ─── Rebuild ──────────────────────────────────────────────

export interface RebuildResult {
  members: number;
  claims: number;
  violations: { eventId: string; error: string }[];
}

/**
 * Rebuild a party's materialized tables from the event log.
 *
 * 1. Replay events, detecting invariant violations (e.g. duplicate preferences)
 * 2. Mark violating events as undone
 * 3. Delete existing materialized rows for this party
 * 4. Rewrite from the clean replay state
 *
 * This should be called with the party locked to prevent concurrent writes.
 */
export async function rebuildParty(
  db: DrizzleD1Database,
  partyId: string,
): Promise<RebuildResult> {
  // Read phase: load all non-undone events
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.partyId, partyId), isNull(events.undoneAt)))
    .orderBy(asc(events.createdAt));

  // Replay with invariant checking
  const members: Map<string, { userId: string }> = new Map();
  const claims: Map<string, {
    claimId: string;
    characterId: number;
    userId: string;
    claimType: string;
    rank: number | null;
  }> = new Map();
  const violations: { eventId: string; error: string }[] = [];

  for (const row of rows) {
    const type = row.type as EventType;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    switch (type) {
      case "member_joined": {
        const userId = payload.userId as string;
        if (members.has(userId)) {
          violations.push({ eventId: row.id, error: "duplicate_member" });
        } else {
          members.set(userId, { userId });
        }
        break;
      }

      case "claim_placed": {
        const claimId = payload.claimId as string;
        const characterId = payload.characterId as number;
        const userId = row.userId;
        const claimType = payload.claimType as string;
        const rank = (payload.rank as number | null) ?? null;

        // Check for duplicate preference
        if (claimType === "preference") {
          const isDuplicate = Array.from(claims.values()).some(
            (c) =>
              c.characterId === characterId &&
              c.userId === userId &&
              c.claimType === "preference",
          );
          if (isDuplicate) {
            violations.push({ eventId: row.id, error: "duplicate_preference" });
            break;
          }
        }

        claims.set(claimId, { claimId, characterId, userId, claimType, rank });
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

      case "claim_cancelled": {
        const claimId = payload.claimId as string;
        claims.delete(claimId);
        break;
      }

      case "party_locked":
      case "party_created":
        break;
    }
  }

  // Write phase: build all writes and batch atomically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writes: any[] = [];

  // Mark violating events as undone
  for (const v of violations) {
    writes.push(
      db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, v.eventId)),
    );
  }

  // Delete existing materialized rows for this party
  writes.push(db.delete(characterClaims).where(eq(characterClaims.partyId, partyId)));
  writes.push(db.delete(partyMembers).where(eq(partyMembers.partyId, partyId)));

  // Rewrite members
  for (const member of members.values()) {
    writes.push(
      db.insert(partyMembers).values({
        partyId,
        userId: member.userId,
        joinedAt: new Date(),
      }),
    );
  }

  // Rewrite claims
  for (const claim of claims.values()) {
    writes.push(
      db.insert(characterClaims).values({
        id: claim.claimId,
        partyId,
        characterId: claim.characterId,
        userId: claim.userId,
        claimType: claim.claimType,
        rank: claim.rank,
        createdAt: new Date(),
      }),
    );
  }

  if (writes.length > 0) {
    await db.batch(writes as [typeof writes[0], ...typeof writes]);
  }

  return {
    members: members.size,
    claims: claims.size,
    violations,
  };
}
