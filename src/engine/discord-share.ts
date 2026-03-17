/** Discord share message formatting — pure function, no side effects. */

export interface DiscordShareInput {
  partyName: string;
  description: string | null;
  memberCount: number;
  openSlotCount: number;
  claimedCount: number;
  contestedCount: number;
  languages: string[];
  pricePerCard: number;
  partyUrl: string;
  status: "open" | "locked";
  locale: string;
}

interface ShareStrings {
  lookingForMembers: string;
  locked: string;
  members: string;
  claimed: string;
  open: string;
  contested: string;
  perCard: string;
  limitedEdition: string;
  onSale: string;
}

const STRINGS: Record<string, ShareStrings> = {
  en: {
    lookingForMembers: "Looking for members!",
    locked: "Locked",
    members: " members",
    claimed: "claimed",
    open: "open",
    contested: "contested",
    perCard: "/card",
    limitedEdition: "Limited edition",
    onSale: "On sale",
  },
  ja: {
    lookingForMembers: "メンバー募集中！",
    locked: "確定済み",
    members: "人",
    claimed: "確定",
    open: "空き",
    contested: "競合",
    perCard: "/枚",
    limitedEdition: "数量限定",
    onSale: "販売期間",
  },
  zh: {
    lookingForMembers: "招募成员中！",
    locked: "已锁定",
    members: "人",
    claimed: "已确认",
    open: "空闲",
    contested: "竞争中",
    perCard: "/张",
    limitedEdition: "限量",
    onSale: "开售",
  },
};

const LANGUAGE_LABELS: Record<string, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

const TICKET_URL = "https://www.lovelive-anime.jp/nijigasaki/movie/Chapter3/ticket.php#ticket_1st_set";

function getStrings(locale: string): ShareStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

/**
 * Format party data into a Discord-friendly message for sharing.
 * Uses Discord markdown (bold, emoji indicators).
 * Output language follows the user's UI locale.
 */
export function formatDiscordShareMessage(input: DiscordShareInput): string {
  const s = getStrings(input.locale);
  const isFull = input.memberCount >= 12;
  const isLocked = input.status === "locked";

  const headline = isLocked
    ? `🎯 **${input.partyName}** — ${s.locked}`
    : isFull
      ? `🎯 **${input.partyName}**`
      : `🎯 **${input.partyName}** — ${s.lookingForMembers}`;

  const lines: string[] = [headline];

  if (input.description) {
    lines.push(input.description);
  }

  lines.push(""); // blank line before product info

  // Product info (event/product names stay in Japanese — they are proper nouns)
  lines.push("🎬 LoveLive! Series 15th Anniversary ラブライブ！フェス＜ラブライブ！虹ヶ咲学園スクールアイドル同好会先行抽選＞");
  lines.push(`🎫 ${s.limitedEdition}「特典コンプリートセット（12枚）」¥21,600（税込）`);
  lines.push(`🗓️ ${s.onSale} 2026/5/15`);
  lines.push("🃏 ムビチケカード特典全12種＆描き下ろしイラスト三つ折りボード");

  lines.push(""); // blank line before party stats

  // Stats line
  const statsParts = [
    `${input.memberCount}/12${s.members}`,
    `${input.claimedCount} ${s.claimed}`,
    `${input.openSlotCount} ${s.open}`,
  ];
  if (input.contestedCount > 0) {
    statsParts.push(`${input.contestedCount} ${s.contested}`);
  }
  lines.push(`📊 ${statsParts.join(" · ")}`);

  // Languages
  const langLabels = input.languages.map((l) => LANGUAGE_LABELS[l] ?? l);
  lines.push(`🌐 ${langLabels.join(", ")}`);

  // Cost per card
  lines.push(`💰 ¥${input.pricePerCard.toLocaleString()}${s.perCard}`);

  // Links
  lines.push("");
  lines.push(`👉 ${input.partyUrl}`);
  lines.push(`🔗 ${TICKET_URL}`);

  return lines.join("\n");
}
