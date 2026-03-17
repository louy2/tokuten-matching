/** Discord share message formatting — pure function, no side effects. */

export interface DiscordShareInput {
  partyName: string;
  description: string | null;
  memberCount: number;
  openSlotCount: number;
  claimedCount: number;
  contestedCount: number;
  languages: string[];
  costPerPerson: number;
  partyUrl: string;
  status: "open" | "locked";
}

const LANGUAGE_LABELS: Record<string, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

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

  lines.push(""); // blank line before stats

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

  // Cost
  lines.push(`💰 ¥${input.costPerPerson.toLocaleString()} per person`);

  // Link
  lines.push("");
  lines.push(`👉 ${input.partyUrl}`);

  return lines.join("\n");
}
