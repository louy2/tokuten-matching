import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { parties, partyMembers, readinessChecks, readinessResponses } from "../db/schema";

export type ReadinessCheckError = "not_leader" | "party_not_found";
export type ReadinessRespondError = "check_not_found" | "not_a_member";

export async function initiateReadinessCheck(
  db: DrizzleD1Database,
  partyId: string,
  userId: string,
): Promise<{ checkId: string } | { error: ReadinessCheckError }> {
  const party = await db
    .select({ leaderId: parties.leaderId })
    .from(parties)
    .where(eq(parties.id, partyId))
    .get();

  if (!party) return { error: "party_not_found" };
  if (party.leaderId !== userId) return { error: "not_leader" };

  const checkId = crypto.randomUUID();
  await db.insert(readinessChecks).values({
    id: checkId,
    partyId,
    initiatedBy: userId,
    createdAt: new Date(),
  });

  return { checkId };
}

export async function respondToReadinessCheck(
  db: DrizzleD1Database,
  partyId: string,
  checkId: string,
  userId: string,
  stillIn: boolean,
): Promise<{ ok: true } | { error: ReadinessRespondError }> {
  const check = await db
    .select()
    .from(readinessChecks)
    .where(
      and(eq(readinessChecks.id, checkId), eq(readinessChecks.partyId, partyId)),
    )
    .get();
  if (!check) return { error: "check_not_found" };

  const membership = await db
    .select()
    .from(partyMembers)
    .where(
      and(eq(partyMembers.partyId, partyId), eq(partyMembers.userId, userId)),
    )
    .get();
  if (!membership) return { error: "not_a_member" };

  await db.insert(readinessResponses).values({
    checkId,
    userId,
    stillIn,
    respondedAt: new Date(),
  });

  return { ok: true };
}

export interface ReadinessStatus {
  responded: { userId: string; stillIn: boolean }[];
  pending: string[];
}

export async function getReadinessStatus(
  db: DrizzleD1Database,
  partyId: string,
  checkId: string,
): Promise<ReadinessStatus> {
  const check = await db
    .select({ initiatedBy: readinessChecks.initiatedBy })
    .from(readinessChecks)
    .where(eq(readinessChecks.id, checkId))
    .get();

  const members = await db
    .select({ userId: partyMembers.userId })
    .from(partyMembers)
    .where(eq(partyMembers.partyId, partyId));

  const responses = await db
    .select({ userId: readinessResponses.userId, stillIn: readinessResponses.stillIn })
    .from(readinessResponses)
    .where(eq(readinessResponses.checkId, checkId));

  const respondedUserIds = new Set(responses.map((r) => r.userId));
  // Leader who initiated is excluded from pending
  const initiator = check?.initiatedBy;

  const pending = members
    .filter((m) => !respondedUserIds.has(m.userId) && m.userId !== initiator)
    .map((m) => m.userId);

  return {
    responded: responses.map((r) => ({ userId: r.userId, stillIn: r.stillIn })),
    pending,
  };
}
