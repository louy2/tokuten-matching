import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // nanoid
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  oauthProvider: text("oauth_provider").notNull(), // "google" | "discord"
  oauthId: text("oauth_id").notNull(),
  languages: text("languages").notNull().default("[]"), // JSON array: ["ja","en","zh"]
  paymentMethods: text("payment_methods").notNull().default("[]"), // JSON array
  characterPreferences: text("character_preferences").notNull().default("[]"), // JSON array of character IDs in preference order, e.g. [3,7,1]
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(), // nanoid
  name: text("name").notNull(),
  description: text("description"),
  leaderId: text("leader_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("open"), // "open" | "locked"
  groupChatLink: text("group_chat_link"),
  languages: text("languages").notNull().default('["ja"]'), // JSON array: ["ja","en","zh"]
  autoPromoteDate: text("auto_promote_date").default("2026-05-08"),
  mituoriBoardClaimedBy: text("mituori_board_claimed_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const partyMembers = sqliteTable(
  "party_members",
  {
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.partyId, table.userId] })],
);

export const characterClaims = sqliteTable(
  "character_claims",
  {
    id: text("id").primaryKey(), // nanoid
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    characterId: integer("character_id").notNull(), // 1-12
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    claimType: text("claim_type").notNull(), // "preference" | "conditional" | "claimed"
    rank: integer("rank"), // for preferences, 1 = most wanted
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // No composite unique here — uniqueness rules are enforced in application logic
  // because they differ by claim_type (see PLAN.md Key Rules)
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    partyId: text("party_id"), // nullable — some events may be system-level
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(), // JSON blob
    undoneAt: integer("undone_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_events_party").on(table.partyId, table.createdAt),
    index("idx_events_user").on(table.userId, table.createdAt),
  ],
);
