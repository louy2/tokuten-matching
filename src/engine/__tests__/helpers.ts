import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { env } from "cloudflare:test";
import { users, parties, partyMembers, characterClaims } from "../../db/schema";

// Migration SQL — must match drizzle/0000_big_maximus.sql
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  oauth_provider text NOT NULL,
  oauth_id text NOT NULL,
  languages text DEFAULT '[]' NOT NULL,
  payment_methods text DEFAULT '[]' NOT NULL,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  description text,
  leader_id text NOT NULL,
  status text DEFAULT 'open' NOT NULL,
  group_chat_link text,
  language text DEFAULT 'ja' NOT NULL,
  auto_promote_date text DEFAULT '2026-05-08',
  created_at integer NOT NULL,
  FOREIGN KEY (leader_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id text NOT NULL,
  user_id text NOT NULL,
  joined_at integer NOT NULL,
  PRIMARY KEY(party_id, user_id),
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS character_claims (
  id text PRIMARY KEY NOT NULL,
  party_id text NOT NULL,
  character_id integer NOT NULL,
  user_id text NOT NULL,
  claim_type text NOT NULL,
  rank integer,
  created_at integer NOT NULL,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

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

/** Run migrations and clear all tables. Call in beforeEach. */
export async function setupDb(): Promise<DrizzleD1Database> {
  const db = getDb();

  // Run migrations (IF NOT EXISTS makes this idempotent)
  for (const stmt of MIGRATION_SQL.split(";").filter((s) => s.trim())) {
    await env.DB.prepare(stmt).run();
  }

  // Clear tables in correct order (foreign keys)
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
): Promise<string> {
  const uid = id ?? nextId("user");
  await db.insert(users).values({
    id: uid,
    displayName: displayName ?? uid,
    oauthProvider: "google",
    oauthId: `oauth-${uid}`,
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
    language?: string;
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
    language: overrides.language ?? "ja",
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
