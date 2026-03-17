import { describe, it, expect } from "vitest";
import { formatDiscordShareMessage, type DiscordShareInput } from "../discord-share";

function makeInput(overrides: Partial<DiscordShareInput> = {}): DiscordShareInput {
  return {
    partyName: "Niji Tokuten Squad",
    description: null,
    memberCount: 3,
    openSlotCount: 9,
    claimedCount: 2,
    contestedCount: 1,
    languages: ["en", "ja"],
    pricePerCard: 1800,
    partyUrl: "https://tokuten.example.com/parties/abc123",
    status: "open",
    ...overrides,
  };
}

describe("formatDiscordShareMessage", () => {
  it("includes party name in bold", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("**Niji Tokuten Squad**");
  });

  it("includes member count and slot summary", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("3/12 members");
    expect(msg).toContain("2 claimed");
    expect(msg).toContain("9 open");
  });

  it("includes languages", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("English");
    expect(msg).toContain("日本語");
  });

  it("includes price per card instead of per person", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("¥1,800 per card");
    expect(msg).not.toContain("per person");
  });

  it("includes party URL", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("https://tokuten.example.com/parties/abc123");
  });

  it("includes description when provided", () => {
    const msg = formatDiscordShareMessage(makeInput({
      description: "Fans worldwide welcome!",
    }));
    expect(msg).toContain("Fans worldwide welcome!");
  });

  it("omits description line when null", () => {
    const msg = formatDiscordShareMessage(makeInput({ description: null }));
    // Should not have empty lines where description would be
    expect(msg).not.toContain("\n\n\n");
  });

  it("shows contested count when there are contested slots", () => {
    const msg = formatDiscordShareMessage(makeInput({ contestedCount: 2 }));
    expect(msg).toContain("2 contested");
  });

  it("omits contested count when zero", () => {
    const msg = formatDiscordShareMessage(makeInput({ contestedCount: 0 }));
    expect(msg).not.toContain("contested");
  });

  it("shows full party message when 12 members", () => {
    const msg = formatDiscordShareMessage(makeInput({
      memberCount: 12,
      openSlotCount: 0,
      claimedCount: 12,
    }));
    expect(msg).toContain("12/12 members");
    expect(msg).not.toContain("Looking for members");
  });

  it("shows locked status for locked party", () => {
    const msg = formatDiscordShareMessage(makeInput({ status: "locked" }));
    expect(msg).toContain("Locked");
  });

  it("handles single language", () => {
    const msg = formatDiscordShareMessage(makeInput({ languages: ["zh"] }));
    expect(msg).toContain("中文");
  });

  it("handles all three languages", () => {
    const msg = formatDiscordShareMessage(makeInput({ languages: ["ja", "en", "zh"] }));
    expect(msg).toContain("日本語");
    expect(msg).toContain("English");
    expect(msg).toContain("中文");
  });

  it("includes product name", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("特典コンプリートセット（12枚）");
  });

  it("includes set price ¥21,600", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("¥21,600");
  });

  it("includes sale date 2026年5月15日", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("2026年5月15日");
  });

  it("includes official ticket URL", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("https://www.lovelive-anime.jp/nijigasaki/movie/Chapter3/ticket.php#ticket_1st_set");
  });

  it("includes ムビチケカード特典 and 三つ折りボード", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("ムビチケカード特典全12種");
    expect(msg).toContain("三つ折りボード");
  });
});
