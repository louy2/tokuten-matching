import { useState } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useFetch, postApi, deleteApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useCharacterName } from "../hooks/useCharacterName";
import { CHARACTERS, SET_PRICE_YEN, type Character } from "../shared/characters";
import type { ClaimType, PartyStatus } from "../shared/types";
import { formatDiscordShareMessage } from "../engine/discord-share";

interface MemberRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  characterPreferences: number[];
}

interface ClaimRow {
  characterId: number;
  userId: string;
  displayName: string;
  claimType: ClaimType;
  rank: number | null;
}

interface PartyData {
  id: string;
  name: string;
  description: string | null;
  leaderId: string;
  status: string;
  groupChatLink: string | null;
  languages: string;
  autoPromoteDate: string | null;
  mituoriBoardClaimedBy: string | null;
  members: MemberRow[];
  claims: ClaimRow[];
}

type SlotState = "open" | "conditional" | "contested" | "claimed";

interface CharacterSlot {
  characterId: number;
  state: SlotState;
  claimedBy: { userId: string; displayName: string } | null;
  conditionals: { userId: string; displayName: string }[];
  preferences: { userId: string; displayName: string; rank: number | null }[];
}

function resolveClientSlots(claims: ClaimRow[], members: MemberRow[]): CharacterSlot[] {
  return CHARACTERS.map((char) => {
    const charClaims = claims.filter((c) => c.characterId === char.id);
    const claimed = charClaims.find((c) => c.claimType === "claimed");
    const conditionals = charClaims.filter((c) => c.claimType === "conditional");

    // Derive preferences from member profiles
    const preferences: { userId: string; displayName: string; rank: number | null }[] = [];
    for (const member of members) {
      const prefs = member.characterPreferences ?? [];
      const rankIndex = prefs.indexOf(char.id);
      if (rankIndex !== -1) {
        preferences.push({
          userId: member.userId,
          displayName: member.displayName,
          rank: rankIndex + 1,
        });
      }
    }
    preferences.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

    let state: SlotState = "open";
    if (claimed) state = "claimed";
    else if (conditionals.length >= 2) state = "contested";
    else if (conditionals.length === 1) state = "conditional";

    return {
      characterId: char.id,
      state,
      claimedBy: claimed
        ? { userId: claimed.userId, displayName: claimed.displayName }
        : null,
      conditionals: conditionals.map((c) => ({
        userId: c.userId,
        displayName: c.displayName,
      })),
      preferences,
    };
  });
}

const STATE_COLORS: Record<SlotState, string> = {
  open: "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
  conditional: "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20",
  contested: "border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/20",
  claimed: "border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20",
};

const STATE_BADGE_COLORS: Record<SlotState, string> = {
  open: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  conditional: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  contested: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  claimed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
};

function ClaimLegend({ t }: { t: (key: string) => string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {t("claimLegend.title")}
        <span className="text-xs text-blue-600 dark:text-blue-400">
          {open ? t("claimLegend.hide") : t("claimLegend.show")}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Slot states */}
          <div className="space-y-2">
            {(["open", "conditional", "contested", "claimed"] as const).map((state) => (
              <div key={state} className="flex items-start gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 ${STATE_BADGE_COLORS[state]}`}>
                  {t(`slotState.${state}`)}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {t(`slotStateDesc.${state}`)}
                </span>
              </div>
            ))}
          </div>

          {/* Claim types */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
            {(["preference", "conditional", "claimed"] as const).map((type) => (
              <div key={type} className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 shrink-0 mt-0.5">
                  {t(`claimType.${type}`)}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {t(`claimTypeDesc.${type}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PartyDetail() {
  const { partyId } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const charName = useCharacterName();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const { data, loading, error, refetch } = useFetch<PartyData>(
    partyId ? `/api/parties/${partyId}` : null,
  );

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error ?? t("partyDetail.notFound")}</p>
        <Link to="/parties" className="text-blue-600 hover:underline">
          {t("partyDetail.backToList")}
        </Link>
      </div>
    );
  }

  const party = data;
  const slots = resolveClientSlots(party.claims, party.members);
  const languages: string[] = (() => {
    try {
      return JSON.parse(party.languages);
    } catch {
      return [];
    }
  })();

  const isMember = user && party.members.some((m) => m.userId === user.id);
  const isLeader = user?.id === party.leaderId;
  const isOpen = party.status === "open";
  const claimedCount = slots.filter((s) => s.state === "claimed").length;
  const memberCount = party.members.length;
  const costPer = memberCount > 0 ? Math.ceil(SET_PRICE_YEN / memberCount) : 0;

  // Check if current user already has a full claim
  const userHasClaimed = user
    ? party.claims.some((c) => c.userId === user.id && c.claimType === "claimed")
    : false;

  async function handleShareToDiscord() {
    const openSlotCount = slots.filter((s) => s.state === "open").length;
    const contestedCount = slots.filter((s) => s.state === "contested").length;
    const message = formatDiscordShareMessage({
      partyName: party.name,
      description: party.description,
      memberCount,
      openSlotCount,
      claimedCount,
      contestedCount,
      languages,
      pricePerCard: Math.ceil(SET_PRICE_YEN / 12),
      partyUrl: `${window.location.origin}/parties/${party.id}`,
      status: party.status as PartyStatus,
    });
    await navigator.clipboard.writeText(message);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleJoin() {
    if (!partyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await postApi(`/api/parties/${partyId}/join`, {});
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim(characterId: number, claimType: ClaimType, rank?: number) {
    if (!partyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await postApi(`/api/parties/${partyId}/claims`, {
        characterId,
        claimType,
        rank: rank ?? null,
      });
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to claim");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelClaim(characterId: number, claimType: "conditional" | "claimed") {
    if (!partyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteApi(`/api/parties/${partyId}/claims`, {
        characterId,
        claimType,
      });
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to cancel claim");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaimBoard() {
    if (!partyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await postApi(`/api/parties/${partyId}/mituori-board`, {});
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to claim board");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnclaimBoard() {
    if (!partyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteApi(`/api/parties/${partyId}/mituori-board`, {});
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to unclaim board");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/parties" className="text-sm text-blue-600 hover:underline">
          {t("partyDetail.backToList")}
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold">{party.name}</h1>
            {party.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{party.description}</p>
            )}
            <div className="flex gap-2 mt-2">
              {languages.map((lang: string) => (
                <span
                  key={lang}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  {lang === "ja" ? "日本語" : lang === "en" ? "English" : lang === "zh" ? "中文" : lang}
                </span>
              ))}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isOpen
                  ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}>
                {isOpen ? t("partyDetail.statusOpen") : t("partyDetail.statusLocked")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold">{memberCount}</div>
          <div className="text-xs text-gray-500">{t("partyDetail.members")}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{claimedCount}<span className="text-gray-400 text-lg">/12</span></div>
          <div className="text-xs text-gray-500">{t("partyDetail.claimed")}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">&yen;{costPer.toLocaleString()}</div>
          <div className="text-xs text-gray-500">{t("partyDetail.perPerson")}</div>
        </div>
      </div>

      {/* Share to Discord */}
      <button
        onClick={handleShareToDiscord}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#5865F2] text-[#5865F2] dark:text-[#7289DA] rounded-lg hover:bg-[#5865F2]/10 text-sm font-medium"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
        </svg>
        {shareCopied ? t("partyDetail.shareCopied") : t("partyDetail.shareToDiscord")}
      </button>

      {/* Join button */}
      {user && !isMember && isOpen && (
        <button
          onClick={handleJoin}
          disabled={actionLoading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {actionLoading ? t("common.loading") : t("partyDetail.joinParty")}
        </button>
      )}

      {!user && isOpen && (
        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">{t("partyDetail.loginToJoin")}</p>
        </div>
      )}

      {/* Group chat link */}
      {isMember && party.groupChatLink && (
        <a
          href={party.groupChatLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-3 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {t("partyDetail.groupChat")}
        </a>
      )}

      {/* Error message */}
      {actionError && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
          {actionError}
        </div>
      )}

      {/* Mituori Board */}
      <div className={`p-4 rounded-lg border ${
        party.mituoriBoardClaimedBy
          ? "border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{t("partyDetail.mituoriBoard")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {party.mituoriBoardClaimedBy
                ? (() => {
                    const claimer = party.members.find((m) => m.userId === party.mituoriBoardClaimedBy);
                    return claimer?.displayName ?? t("partyDetail.mituoriBoardClaimed");
                  })()
                : t("partyDetail.mituoriBoardUnclaimed")}
            </p>
          </div>
          {isMember && isOpen && (
            <>
              {!party.mituoriBoardClaimedBy && (
                <button
                  onClick={handleClaimBoard}
                  disabled={actionLoading}
                  className="text-xs px-3 py-1.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40 disabled:opacity-50 font-medium"
                >
                  {t("partyDetail.claimBoard")}
                </button>
              )}
              {party.mituoriBoardClaimedBy === user?.id && (
                <button
                  onClick={handleUnclaimBoard}
                  disabled={actionLoading}
                  className="text-xs px-3 py-1.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-50 font-medium"
                >
                  {t("partyDetail.unclaimBoard")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Claim legend */}
      <ClaimLegend t={t} />

      {/* Character Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("partyDetail.characters")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((slot) => (
            <CharacterCard
              key={slot.characterId}
              slot={slot}
              character={CHARACTERS.find((c) => c.id === slot.characterId)!}
              charName={charName(slot.characterId)}
              isMember={!!isMember}
              isOpen={isOpen}
              userId={user?.id ?? null}
              userHasClaimed={userHasClaimed}
              onClaim={handleClaim}
              onCancelClaim={handleCancelClaim}
              actionLoading={actionLoading}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* Members list */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          {t("partyDetail.memberList")} ({memberCount})
        </h2>
        <div className="space-y-2">
          {party.members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-400">
                {m.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <span className="font-medium text-sm">{m.displayName}</span>
                {m.userId === party.leaderId && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
                    {t("partyDetail.leader")}
                  </span>
                )}
              </div>
              {/* Show what this member has claimed */}
              {(() => {
                const memberClaim = party.claims.find(
                  (c) => c.userId === m.userId && c.claimType === "claimed",
                );
                if (memberClaim) {
                  return (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {charName(memberClaim.characterId)}
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* Leader info */}
      {isLeader && (
        <div className="p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <h3 className="font-semibold text-sm text-purple-700 dark:text-purple-400 mb-1">
            {t("partyDetail.leaderPanel")}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {t("partyDetail.leaderInfo")}
          </p>
        </div>
      )}
    </div>
  );
}

interface CharacterCardProps {
  slot: CharacterSlot;
  character: Character;
  charName: string;
  isMember: boolean;
  isOpen: boolean;
  userId: string | null;
  userHasClaimed: boolean;
  onClaim: (characterId: number, claimType: ClaimType, rank?: number) => void;
  onCancelClaim: (characterId: number, claimType: "conditional" | "claimed") => void;
  actionLoading: boolean;
  t: (key: string) => string;
}

function CharacterCard({
  slot,
  character,
  charName,
  isMember,
  isOpen,
  userId,
  userHasClaimed,
  onClaim,
  onCancelClaim,
  actionLoading,
  t,
}: CharacterCardProps) {
  const [expanded, setExpanded] = useState(false);

  const canClaim = isMember && isOpen && slot.state !== "claimed" && !userHasClaimed;
  const canConditional =
    isMember && isOpen && slot.state === "open" &&
    !slot.conditionals.some((c) => c.userId === userId);
  const userHasConditionalHere = isMember && isOpen && slot.conditionals.some((c) => c.userId === userId);
  const userHasClaimedHere = isMember && isOpen && slot.claimedBy?.userId === userId;

  return (
    <div
      className={`border rounded-lg p-3 border-l-4 ${STATE_COLORS[slot.state]}`}
      style={{ borderLeftColor: character.color }}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: character.color }}
          >
            {character.id}
          </span>
          <span className="font-medium">{charName}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATE_BADGE_COLORS[slot.state]}`}>
            {t(`slotState.${slot.state}`)}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Summary line */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {slot.state === "claimed" && slot.claimedBy && (
          <span>{slot.claimedBy.displayName}</span>
        )}
        {slot.state === "conditional" && slot.conditionals.length > 0 && (
          <span>{slot.conditionals[0].displayName} ({t("claimType.conditional")})</span>
        )}
        {slot.state === "contested" && (
          <span>{slot.conditionals.length} {t("partyDetail.competing")}</span>
        )}
        {slot.state === "open" && slot.preferences.length > 0 && (
          <span>{slot.preferences.length} {t("partyDetail.interested")}</span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
          {/* Preferences */}
          {slot.preferences.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">{t("claimType.preference")}</div>
              {slot.preferences.map((p) => (
                <div key={p.userId} className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                  {p.displayName} {p.rank ? `(#${p.rank})` : ""}
                </div>
              ))}
            </div>
          )}

          {/* Conditionals */}
          {slot.conditionals.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">{t("claimType.conditional")}</div>
              {slot.conditionals.map((c) => (
                <div key={c.userId} className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                  {c.displayName}
                </div>
              ))}
            </div>
          )}

          {/* Claimed */}
          {slot.claimedBy && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">{t("claimType.claimed")}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                {slot.claimedBy.displayName}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {isMember && isOpen && (
            <div className="flex flex-wrap gap-2 pt-2">
              {canConditional && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim(slot.characterId, "conditional");
                  }}
                  disabled={actionLoading}
                  className="text-xs px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/40 disabled:opacity-50"
                >
                  {t("partyDetail.conditionalClaim")}
                </button>
              )}
              {canClaim && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim(slot.characterId, "claimed");
                  }}
                  disabled={actionLoading}
                  className="text-xs px-2.5 py-1 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40 disabled:opacity-50"
                >
                  {t("partyDetail.fullClaim")}
                </button>
              )}
              {userHasConditionalHere && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelClaim(slot.characterId, "conditional");
                  }}
                  disabled={actionLoading}
                  className="text-xs px-2.5 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-50"
                >
                  {t("partyDetail.cancelConditional")}
                </button>
              )}
              {userHasClaimedHere && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelClaim(slot.characterId, "claimed");
                  }}
                  disabled={actionLoading}
                  className="text-xs px-2.5 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-50"
                >
                  {t("partyDetail.cancelClaim")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
