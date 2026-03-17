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
    locale: "en",
    ...overrides,
  };
}

describe("formatDiscordShareMessage — English (default)", () => {
  it("includes party name in bold", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("**Niji Tokuten Squad**");
  });

  it("includes member count and slot summary in English", () => {
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

  it("includes price per card in English", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("¥1,800/card");
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

  it("shows locked status in English", () => {
    const msg = formatDiscordShareMessage(makeInput({ status: "locked" }));
    expect(msg).toContain("Locked");
  });

  it("includes product info", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("特典コンプリートセット（12枚）");
    expect(msg).toContain("¥21,600");
    expect(msg).toContain("2026/5/15");
    expect(msg).toContain("https://www.lovelive-anime.jp/nijigasaki/movie/Chapter3/ticket.php#ticket_1st_set");
  });

  it("uses English labels for product lines", () => {
    const msg = formatDiscordShareMessage(makeInput());
    expect(msg).toContain("Limited");
    expect(msg).toContain("On sale");
  });
});

describe("formatDiscordShareMessage — Japanese", () => {
  it("uses Japanese headline", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja" }));
    expect(msg).toContain("メンバー募集中！");
  });

  it("uses Japanese stat labels", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja" }));
    expect(msg).toContain("3/12人");
    expect(msg).toContain("2 確定");
    expect(msg).toContain("9 空き");
  });

  it("uses Japanese per-card label", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja" }));
    expect(msg).toContain("¥1,800/枚");
  });

  it("shows locked in Japanese", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja", status: "locked" }));
    expect(msg).toContain("確定済み");
  });

  it("shows contested in Japanese", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja", contestedCount: 2 }));
    expect(msg).toContain("2 競合");
  });

  it("uses Japanese product labels", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "ja" }));
    expect(msg).toContain("数量限定");
    expect(msg).toContain("販売期間");
  });
});

describe("formatDiscordShareMessage — Chinese", () => {
  it("uses Chinese headline", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "zh" }));
    expect(msg).toContain("招募成员中！");
  });

  it("uses Chinese stat labels", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "zh" }));
    expect(msg).toContain("3/12人");
    expect(msg).toContain("2 已确认");
    expect(msg).toContain("9 空闲");
  });

  it("uses Chinese per-card label", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "zh" }));
    expect(msg).toContain("¥1,800/张");
  });

  it("shows locked in Chinese", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "zh", status: "locked" }));
    expect(msg).toContain("已锁定");
  });

  it("shows contested in Chinese", () => {
    const msg = formatDiscordShareMessage(makeInput({ locale: "zh", contestedCount: 2 }));
    expect(msg).toContain("2 竞争中");
  });
});
