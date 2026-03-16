import { eq, and, isNull, lte, asc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { events, characterClaims, partyMembers, parties, users } from "../db/schema";
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

interface ReplayParty {
  name: string;
  description: string | null;
  leaderId: string;
  status: "open" | "locked";
  languages: string[];
  groupChatLink: string | null;
  autoPromoteDate: string | null;
}

interface ReplayUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  oauthProvider: string;
  oauthId: string;
}

export interface ReplayState {
  party: ReplayParty | null;
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

  let party: ReplayParty | null = null;
  const members: Map<string, ReplayMember> = new Map();
  const claims: Map<string, ReplayClaim> = new Map();

  for (const row of rows) {
    const type = row.type as EventType;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    switch (type) {
      case "party_created": {
        party = {
          name: payload.name as string,
          description: (payload.description as string | null) ?? null,
          leaderId: payload.leaderId as string,
          status: "open",
          languages: (payload.languages as string[]) ?? ["ja"],
          groupChatLink: (payload.groupChatLink as string | null) ?? null,
          autoPromoteDate: (payload.autoPromoteDate as string | null) ?? null,
        };
        break;
      }

      case "party_locked": {
        if (party) party.status = "locked";
        break;
      }

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

      case "user_created":
      case "user_profile_updated":
        // User events have partyId: null, shouldn't appear in party replay
        break;
    }
  }

  return {
    party,
    members: Array.from(members.values()),
    claims: Array.from(claims.values()),
  };
}

// ─── Rebuild party ────────────────────────────────────────

export interface RebuildResult {
  party: boolean;
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
 * 4. Rewrite party row, members, and claims from the clean replay state
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
  let party: ReplayParty | null = null;
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
      case "party_created": {
        party = {
          name: payload.name as string,
          description: (payload.description as string | null) ?? null,
          leaderId: payload.leaderId as string,
          status: "open",
          languages: (payload.languages as string[]) ?? ["ja"],
          groupChatLink: (payload.groupChatLink as string | null) ?? null,
          autoPromoteDate: (payload.autoPromoteDate as string | null) ?? null,
        };
        break;
      }

      case "party_locked": {
        if (party) party.status = "locked";
        break;
      }

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

      case "user_created":
      case "user_profile_updated":
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

  // Rebuild party row if we have a party_created event
  if (party) {
    writes.push(
      db.update(parties).set({
        name: party.name,
        description: party.description,
        leaderId: party.leaderId,
        status: party.status,
        groupChatLink: party.groupChatLink,
        languages: JSON.stringify(party.languages),
        autoPromoteDate: party.autoPromoteDate,
      }).where(eq(parties.id, partyId)),
    );
  }

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
    party: party !== null,
    members: members.size,
    claims: claims.size,
    violations,
  };
}

// ─── Rebuild user ─────────────────────────────────────────

export interface RebuildUserResult {
  found: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Rebuild a user's profile from the event log.
 * User events have partyId: null and are queried by userId.
 */
export async function rebuildUser(
  db: DrizzleD1Database,
  userId: string,
): Promise<RebuildUserResult> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), isNull(events.undoneAt)))
    .orderBy(asc(events.createdAt));

  let user: ReplayUser | null = null;

  for (const row of rows) {
    const type = row.type as EventType;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    switch (type) {
      case "user_created": {
        user = {
          userId: payload.userId as string,
          displayName: payload.displayName as string,
          avatarUrl: (payload.avatarUrl as string | null) ?? null,
          oauthProvider: payload.oauthProvider as string,
          oauthId: payload.oauthId as string,
        };
        break;
      }

      case "user_profile_updated": {
        if (user) {
          user.displayName = payload.displayName as string;
          user.avatarUrl = (payload.avatarUrl as string | null) ?? null;
        }
        break;
      }

      default:
        // Skip party-scoped events
        break;
    }
  }

  if (!user) {
    return { found: false, displayName: null, avatarUrl: null };
  }

  // Rebuild materialized user row
  await db.batch([
    db.update(users).set({
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }).where(eq(users.id, userId)),
  ]);

  return {
    found: true,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}
