import { SET_PRICE_YEN } from "../shared/characters";
import type { PartyStatus } from "../shared/types";

export interface Party {
  id: string;
  name: string;
  description: string | null;
  leaderId: string;
  status: PartyStatus;
  groupChatLink: string | null;
  language: string;
  autoPromoteDate: string | null;
  createdAt: Date;
}

export interface Member {
  partyId: string;
  userId: string;
  joinedAt: Date;
}

// ─── Browse / Filter ───────────────────────────────────────

export interface PartyFilter {
  language?: string;
  /** Only parties that have this character slot open */
  needsCharacter?: number;
}

export interface BrowsePartyInfo {
  party: Party;
  memberCount: number;
  openSlots: number;
  claimedSlots: number;
}

export function filterParties(
  infos: BrowsePartyInfo[],
  filter: PartyFilter,
): BrowsePartyInfo[] {
  let result = infos.filter((p) => p.party.status === "open");
  if (filter.language) {
    result = result.filter((p) => p.party.language === filter.language);
  }
  if (filter.needsCharacter) {
    result = result.filter((p) => p.openSlots > 0);
  }
  return result;
}

// ─── Join ──────────────────────────────────────────────────

export type JoinError = "party_locked" | "already_a_member";

export function validateJoin(
  partyStatus: PartyStatus,
  existingMembers: string[],
  userId: string,
): JoinError | null {
  if (partyStatus === "locked") return "party_locked";
  if (existingMembers.includes(userId)) return "already_a_member";
  return null;
}

// ─── Cost split ────────────────────────────────────────────

/** Cost per person = ¥21,600 / members with claims. Returns 0 if nobody has claims. */
export function costPerPerson(membersWithClaims: number): number {
  if (membersWithClaims <= 0) return 0;
  return Math.ceil(SET_PRICE_YEN / membersWithClaims);
}

// ─── Deadline / countdown ──────────────────────────────────

const PREORDER_DATE = new Date("2026-05-15T00:00:00+09:00");

export function daysUntilDeadline(now: Date = new Date()): number {
  const diff = PREORDER_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isAutoPromoteDue(
  autoPromoteDate: string | null,
  now: Date = new Date(),
): boolean {
  if (!autoPromoteDate) return false;
  // autoPromoteDate is YYYY-MM-DD, interpret as JST midnight
  const target = new Date(autoPromoteDate + "T00:00:00+09:00");
  return now >= target;
}

// ─── Multi-party transparency ──────────────────────────────

/**
 * Given a user's memberships across all parties, return the party IDs
 * where they are also a member (excluding the current party).
 */
export function otherParties(
  userId: string,
  currentPartyId: string,
  allMemberships: { partyId: string; userId: string }[],
): string[] {
  return allMemberships
    .filter((m) => m.userId === userId && m.partyId !== currentPartyId)
    .map((m) => m.partyId);
}
