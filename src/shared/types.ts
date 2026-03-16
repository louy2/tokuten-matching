/** API response types shared between client and server */

export type ClaimType = "preference" | "conditional" | "claimed";
export type PartyStatus = "open" | "locked";
export type OAuthProvider = "google" | "discord";
export type Language = "ja" | "en" | "zh";

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  languages: Language[];
  paymentMethods: string[];
}

export interface PartyListItem {
  id: string;
  name: string;
  languages: Language[];
  memberCount: number;
  openSlots: number;
  contestedCount: number;
  createdAt: string;
}

export interface PartyDetail {
  id: string;
  name: string;
  description: string | null;
  leaderId: string;
  status: PartyStatus;
  groupChatLink: string | null;
  languages: Language[];
  autoPromoteDate: string | null;
  members: PartyMember[];
  claims: CharacterClaimView[];
}

export interface PartyMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface CharacterClaimView {
  characterId: number;
  userId: string;
  displayName: string;
  claimType: ClaimType;
  rank: number | null;
}

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}
