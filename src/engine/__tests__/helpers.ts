import type { Claim } from "../claims";
import type { Party, Member } from "../parties";

let _id = 0;
function nextId() {
  return `id-${++_id}`;
}

export function resetIds() {
  _id = 0;
}

export function makeUser(id?: string) {
  return id ?? nextId();
}

export function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: overrides.id ?? nextId(),
    name: overrides.name ?? "Test Party",
    description: overrides.description ?? null,
    leaderId: overrides.leaderId ?? "leader-1",
    status: overrides.status ?? "open",
    groupChatLink: overrides.groupChatLink ?? null,
    language: overrides.language ?? "ja",
    autoPromoteDate: overrides.autoPromoteDate ?? "2026-05-08",
    createdAt: overrides.createdAt ?? new Date("2026-03-01"),
  };
}

export function makeMember(partyId: string, userId: string): Member {
  return { partyId, userId, joinedAt: new Date() };
}

export function makeClaim(
  overrides: Partial<Claim> & Pick<Claim, "partyId" | "characterId" | "userId" | "claimType">,
): Claim {
  return {
    id: overrides.id ?? nextId(),
    rank: overrides.rank ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    ...overrides,
  };
}
