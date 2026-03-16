import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { env } from "cloudflare:test";
import { users, parties, partyMembers, characterClaims, events } from "../../db/schema";

let _id = 0;
export function nextId(prefix = "id") {
  return `${prefix}-${++_id}`;
}

export function resetIds() {
  _id = 0;
}

/** Get a Drizzle instance backed by the D1 test binding. */
export function getDb(): DrizzleD1Database {
  return drizzle(env.DB);
}

/** Clear all tables. Migrations are applied by the setup file. */
export async function setupDb(): Promise<DrizzleD1Database> {
  const db = getDb();

  // Clear tables in correct order (foreign keys)
  await db.delete(events);
  await db.delete(characterClaims);
  await db.delete(partyMembers);
  await db.delete(parties);
  await db.delete(users);

  resetIds();
  return db;
}

/** Insert a test user and return their ID. */
export async function insertUser(
  db: DrizzleD1Database,
  id?: string,
  displayName?: string,
  overrides?: { oauthProvider?: string; oauthId?: string },
): Promise<string> {
  const uid = id ?? nextId("user");
  await db.insert(users).values({
    id: uid,
    displayName: displayName ?? uid,
    oauthProvider: overrides?.oauthProvider ?? "discord",
    oauthId: overrides?.oauthId ?? `oauth-${uid}`,
    createdAt: new Date(),
  });
  return uid;
}

/** Insert a test party and return its ID. */
export async function insertParty(
  db: DrizzleD1Database,
  overrides: {
    id?: string;
    name?: string;
    leaderId: string;
    status?: string;
    languages?: string[];
    groupChatLink?: string | null;
    autoPromoteDate?: string | null;
  },
): Promise<string> {
  const pid = overrides.id ?? nextId("party");
  await db.insert(parties).values({
    id: pid,
    name: overrides.name ?? `Party ${pid}`,
    leaderId: overrides.leaderId,
    status: overrides.status ?? "open",
    languages: JSON.stringify(overrides.languages ?? ["ja"]),
    groupChatLink: overrides.groupChatLink ?? null,
    autoPromoteDate: overrides.autoPromoteDate ?? "2026-05-08",
    createdAt: new Date(),
  });
  return pid;
}

/** Insert a party membership. */
export async function insertMember(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<void> {
  await db.insert(partyMembers).values({
    partyId,
    userId,
    joinedAt: new Date(),
  });
}

/** Insert a claim row. */
export async function insertClaim(
  db: DrizzleD1Database,
  overrides: {
    id?: string;
    partyId: string;
    characterId: number;
    userId: string;
    claimType: string;
    rank?: number | null;
  },
): Promise<string> {
  const cid = overrides.id ?? nextId("claim");
  await db.insert(characterClaims).values({
    id: cid,
    partyId: overrides.partyId,
    characterId: overrides.characterId,
    userId: overrides.userId,
    claimType: overrides.claimType,
    rank: overrides.rank ?? null,
    createdAt: new Date(),
  });
  return cid;
}

/** Insert a test event and return its ID. */
export async function insertEvent(
  db: DrizzleD1Database,
  overrides: {
    id?: string;
    partyId: string | null;
    userId: string;
    type: string;
    payload?: Record<string, unknown>;
    createdAt?: Date;
    undoneAt?: Date | null;
  },
): Promise<string> {
  const eid = overrides.id ?? nextId("evt");
  await db.insert(events).values({
    id: eid,
    partyId: overrides.partyId,
    userId: overrides.userId,
    type: overrides.type,
    payload: JSON.stringify(overrides.payload ?? {}),
    createdAt: overrides.createdAt ?? new Date(),
    undoneAt: overrides.undoneAt ?? null,
  });
  return eid;
}
