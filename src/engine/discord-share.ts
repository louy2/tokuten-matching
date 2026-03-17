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
}

const LANGUAGE_LABELS: Record<string, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

const TICKET_URL = "https://www.lovelive-anime.jp/nijigasaki/movie/Chapter3/ticket.php#ticket_1st_set";

/**
 * Format party data into a Discord-friendly message for sharing.
 * Uses Discord markdown (bold, emoji indicators).
 */
export function formatDiscordShareMessage(input: DiscordShareInput): string {
  const isFull = input.memberCount >= 12;
  const isLocked = input.status === "locked";

  const headline = isLocked
    ? `🎯 **${input.partyName}** — Locked`
    : isFull
      ? `🎯 **${input.partyName}**`
      : `🎯 **${input.partyName}** — Looking for members!`;

  const lines: string[] = [headline];

  if (input.description) {
    lines.push(input.description);
  }

  lines.push(""); // blank line before product info

  // Product info
  lines.push("🎬 LoveLive! Series 15th Anniversary ラブライブ！フェス＜ラブライブ！虹ヶ咲学園スクールアイドル同好会先行抽選＞");
  lines.push("🎫 数量限定「特典コンプリートセット（12枚）」¥21,600（税込）");
  lines.push("🗓️ 販売期間 2026年5月15日(金)〜");
  lines.push("🃏 ムビチケカード特典全12種＆描き下ろしイラスト三つ折りボード");

  lines.push(""); // blank line before party stats

  // Stats line
  const statsParts = [
    `${input.memberCount}/12 members`,
    `${input.claimedCount} claimed`,
    `${input.openSlotCount} open`,
  ];
  if (input.contestedCount > 0) {
    statsParts.push(`${input.contestedCount} contested`);
  }
  lines.push(`📊 ${statsParts.join(" · ")}`);

  // Languages
  const langLabels = input.languages.map((l) => LANGUAGE_LABELS[l] ?? l);
  lines.push(`🌐 ${langLabels.join(", ")}`);

  // Cost per card
  lines.push(`💰 ¥${input.pricePerCard.toLocaleString()} per card`);

  // Links
  lines.push("");
  lines.push(`👉 ${input.partyUrl}`);
  lines.push(`🔗 ${TICKET_URL}`);

  return lines.join("\n");
}
