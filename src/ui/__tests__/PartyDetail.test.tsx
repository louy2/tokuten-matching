import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyDetail } from "../../pages/PartyDetail";
import { renderWithProviders, setupFetchMock, mockUser, mockLeader } from "./helpers";
import { SET_PRICE_YEN } from "../../shared/characters";

function makePartyData(overrides: Record<string, unknown> = {}) {
  return {
    id: "party-1",
    name: "Test Party",
    description: "A test party for fans",
    leaderId: "leader-1",
    status: "open",
    groupChatLink: null,
    languages: '["en"]',
    autoPromoteDate: null,
    mituoriBoardClaimedBy: null,
    members: [],
    claims: [],
    ...overrides,
  };
}

function makeMember(id: string, name: string, prefs: number[] = []) {
  return {
    userId: id,
    displayName: name,
    avatarUrl: null,
    joinedAt: "2025-01-01T00:00:00Z",
    characterPreferences: prefs,
  };
}

function makeClaim(charId: number, userId: string, displayName: string, claimType: string, rank: number | null = null) {
  return { characterId: charId, userId, displayName, claimType, rank };
}

describe("PartyDetail — JOIN scenarios", () => {
  it("shows join button for logged-in non-member on open party", async () => {
    const party = makePartyData({
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Join this Party" })).toBeInTheDocument();
  });

  it("shows login prompt for unauthenticated users on open party", async () => {
    const party = makePartyData({
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Log in to join this party")).toBeInTheDocument();
  });

  it("does not show join button for existing member", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Join this Party" })).not.toBeInTheDocument();
  });

  it("does not show join button on locked party", async () => {
    const party = makePartyData({
      status: "locked",
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Join this Party" })).not.toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("calls POST /join when join button is clicked", async () => {
    const party = makePartyData({
      members: [makeMember("leader-1", "LeaderUser")],
    });
    const fetchMock = setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join this Party" }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "POST",
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      expect(String(postCalls[0][0])).toContain("/join");
    });
  });
});

describe("PartyDetail — party header and stats", () => {
  it("shows party name, description, language badges, and status", async () => {
    const party = makePartyData({
      languages: '["en","ja"]',
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("A test party for fans")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("日本語")).toBeInTheDocument();
    // "Open" appears on both the party status badge and character slot badges
    const openBadges = screen.getAllByText("Open");
    expect(openBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows stats bar with member count, claimed count, and cost per person", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "User2"),
        makeMember("user-3", "User3"),
      ],
      claims: [
        makeClaim(1, "leader-1", "LeaderUser", "claimed"),
        makeClaim(2, "user-2", "User2", "claimed"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Stats bar shows member count in a large font
    const statsSection = document.querySelector(".grid.grid-cols-3")!;
    expect(statsSection).toBeTruthy();
    expect(statsSection.textContent).toContain("3");
    // Cost per person: ceil(21600 / 3) = 7200
    const costPer = Math.ceil(SET_PRICE_YEN / 3);
    expect(screen.getByText(`¥${costPer.toLocaleString()}`)).toBeInTheDocument();
  });

  it("shows back to list link", async () => {
    const party = makePartyData();
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Back to parties" })).toBeInTheDocument();
  });
});

describe("PartyDetail — RECORD scenarios (claim states)", () => {
  it("shows all 12 characters as Open when no claims exist", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    const openBadges = screen.getAllByText("Open");
    // 12 characters + 1 party status badge = at least 13
    expect(openBadges.length).toBeGreaterThanOrEqual(12);
  });

  it("shows Conditional state for character with one conditional claim", async () => {
    const party = makePartyData({
      members: [
        makeMember("user-1", "TestUser"),
        makeMember("user-2", "User2"),
      ],
      claims: [makeClaim(1, "user-2", "User2", "conditional")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Conditional")).toBeInTheDocument();
  });

  it("shows Contested state for character with 2+ conditionals", async () => {
    const party = makePartyData({
      members: [
        makeMember("user-1", "TestUser"),
        makeMember("user-2", "User2"),
        makeMember("user-3", "User3"),
      ],
      claims: [
        makeClaim(1, "user-2", "User2", "conditional"),
        makeClaim(1, "user-3", "User3", "conditional"),
      ],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Contested")).toBeInTheDocument();
    expect(screen.getByText("2 competing")).toBeInTheDocument();
  });

  it("shows Claimed state for character with a full claim", async () => {
    const party = makePartyData({
      members: [makeMember("user-2", "User2")],
      claims: [makeClaim(1, "user-2", "User2", "claimed")],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    // "Claimed" appears as badge and as stats label
    const claimedBadges = screen.getAllByText("Claimed");
    expect(claimedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows conditional and full claim action buttons for a member on an open character", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Click on Ayumu's card to expand it
    await user.click(screen.getByText("Ayumu Uehara"));

    expect(screen.getByRole("button", { name: "Conditional claim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full claim" })).toBeInTheDocument();
  });

  it("does not show claim buttons for non-member", async () => {
    const party = makePartyData({
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Click on character card
    await user.click(screen.getByText("Ayumu Uehara"));

    expect(screen.queryByRole("button", { name: "Conditional claim" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full claim" })).not.toBeInTheDocument();
  });

  it("does not show claim buttons on a locked party", async () => {
    const party = makePartyData({
      status: "locked",
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Ayumu Uehara"));

    expect(screen.queryByRole("button", { name: "Conditional claim" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full claim" })).not.toBeInTheDocument();
  });

  it("hides full claim button when user already has a claimed character", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
      claims: [makeClaim(2, "user-1", "TestUser", "claimed")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Click on a different, open character
    await user.click(screen.getByText("Shizuku Osaka"));

    // Should not show full claim since user already has one
    expect(screen.queryByRole("button", { name: "Full claim" })).not.toBeInTheDocument();
  });

  it("shows cancel conditional button for user's own conditional claim", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
      claims: [makeClaim(1, "user-1", "TestUser", "conditional")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Ayumu Uehara"));
    expect(screen.getByRole("button", { name: "Cancel conditional" })).toBeInTheDocument();
  });

  it("shows cancel claim button for user's own full claim", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
      claims: [makeClaim(1, "user-1", "TestUser", "claimed")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Ayumu appears in character grid and member list; click the first (grid card)
    const ayumuElements = screen.getAllByText("Ayumu Uehara");
    await user.click(ayumuElements[0]);
    expect(screen.getByRole("button", { name: "Cancel claim" })).toBeInTheDocument();
  });

  it("calls POST /claims when conditional claim button is clicked", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
    });
    const fetchMock = setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Ayumu Uehara"));
    await user.click(screen.getByRole("button", { name: "Conditional claim" }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "POST",
      );
      const claimCall = postCalls.find((c: unknown[]) => String(c[0]).includes("/claims"));
      expect(claimCall).toBeTruthy();
    });
  });

  it("calls DELETE /claims when cancel conditional is clicked", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
      claims: [makeClaim(1, "user-1", "TestUser", "conditional")],
    });
    const fetchMock = setupFetchMock(mockUser, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Ayumu Uehara"));
    await user.click(screen.getByRole("button", { name: "Cancel conditional" }));

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "DELETE",
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("PartyDetail — mixed claim states across a full party", () => {
  it("renders a realistic party with open, conditional, contested, and claimed characters", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "User2"),
        makeMember("user-3", "User3"),
      ],
      claims: [
        makeClaim(1, "leader-1", "LeaderUser", "claimed"),
        makeClaim(3, "user-2", "User2", "conditional"),
        makeClaim(5, "user-2", "User2", "conditional"),
        makeClaim(5, "user-3", "User3", "conditional"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Should have: Claimed (char 1), Conditional (char 3), Contested (char 5), rest Open
    const claimed = screen.getAllByText("Claimed");
    expect(claimed.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Conditional")).toBeInTheDocument();
    expect(screen.getByText("Contested")).toBeInTheDocument();
  });
});

describe("PartyDetail — DISCUSS scenarios", () => {
  it("shows group chat link for members", async () => {
    const party = makePartyData({
      groupChatLink: "https://discord.gg/test",
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    const chatLink = screen.getByRole("link", { name: /Open Group Chat/ });
    expect(chatLink).toHaveAttribute("href", "https://discord.gg/test");
    expect(chatLink).toHaveAttribute("target", "_blank");
  });

  it("does not show group chat link for non-members", async () => {
    const party = makePartyData({
      groupChatLink: "https://discord.gg/test",
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.queryByText("Open Group Chat")).not.toBeInTheDocument();
  });

  it("does not show group chat link when party has none", async () => {
    const party = makePartyData({
      groupChatLink: null,
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.queryByText("Open Group Chat")).not.toBeInTheDocument();
  });

  it("shows contested characters as needing discussion", async () => {
    const party = makePartyData({
      members: [
        makeMember("user-1", "TestUser"),
        makeMember("user-2", "User2"),
        makeMember("user-3", "User3"),
      ],
      claims: [
        makeClaim(1, "user-2", "User2", "conditional"),
        makeClaim(1, "user-3", "User3", "conditional"),
        makeClaim(5, "user-2", "User2", "conditional"),
        makeClaim(5, "user-1", "TestUser", "conditional"),
      ],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    // Two contested characters
    const contested = screen.getAllByText("Contested");
    expect(contested.length).toBe(2);
    const competing = screen.getAllByText("2 competing");
    expect(competing.length).toBe(2);
  });
});

describe("PartyDetail — member list", () => {
  it("shows all members with names", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "Alice"),
        makeMember("user-3", "Bob"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("LeaderUser")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows leader badge next to leader name", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "Alice"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Leader")).toBeInTheDocument();
  });

  it("shows claimed character name next to member who claimed it", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "Alice"),
      ],
      claims: [makeClaim(1, "leader-1", "LeaderUser", "claimed")],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    // Ayumu Uehara should show in character grid AND next to the member
    const ayumuInstances = screen.getAllByText("Ayumu Uehara");
    expect(ayumuInstances.length).toBeGreaterThanOrEqual(2);
  });

  it("shows member count in member list heading", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-2", "Alice"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Members (2)")).toBeInTheDocument();
  });
});

describe("PartyDetail — leader panel", () => {
  it("shows leader panel for the party leader", async () => {
    const party = makePartyData({
      members: [makeMember("leader-1", "LeaderUser")],
    });
    setupFetchMock(mockLeader, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Leader Panel")).toBeInTheDocument();
    expect(screen.getByText(/manage members and lock the party/)).toBeInTheDocument();
  });

  it("does not show leader panel for non-leader members", async () => {
    const party = makePartyData({
      members: [
        makeMember("leader-1", "LeaderUser"),
        makeMember("user-1", "TestUser"),
      ],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.queryByText("Leader Panel")).not.toBeInTheDocument();
  });
});

describe("PartyDetail — claim legend", () => {
  it("shows claim legend toggle button", async () => {
    const party = makePartyData();
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("How claiming works")).toBeInTheDocument();
    expect(screen.getByText("Show guide")).toBeInTheDocument();
  });

  it("toggles claim legend open and closed", async () => {
    const party = makePartyData();
    setupFetchMock(null, { "/api/parties/party-1": party });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // Open legend
    await user.click(screen.getByText("How claiming works"));
    expect(screen.getByText("Hide guide")).toBeInTheDocument();
    // Slot state descriptions
    expect(screen.getByText(/No one has claimed this character yet/)).toBeInTheDocument();
    expect(screen.getByText(/One person has a tentative claim/)).toBeInTheDocument();
    expect(screen.getByText(/Two or more people want this character/)).toBeInTheDocument();
    expect(screen.getByText(/This character is locked in/)).toBeInTheDocument();

    // Close legend
    await user.click(screen.getByText("How claiming works"));
    expect(screen.getByText("Show guide")).toBeInTheDocument();
  });
});

describe("PartyDetail — Mituori Board", () => {
  it("shows unclaimed board state", async () => {
    const party = makePartyData({
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Tri-fold Board")).toBeInTheDocument();
    expect(screen.getByText("No one has claimed the board yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim board" })).toBeInTheDocument();
  });

  it("shows claimed board state with claimer name", async () => {
    const party = makePartyData({
      mituoriBoardClaimedBy: "user-1",
      members: [makeMember("user-1", "TestUser")],
    });
    setupFetchMock(mockUser, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Unclaim board" })).toBeInTheDocument();
  });
});

describe("PartyDetail — cost split display", () => {
  it("shows correct cost per person for different party sizes", async () => {
    // 1 member => ¥21,600
    const party1 = makePartyData({
      members: [makeMember("u1", "User1")],
    });
    setupFetchMock(null, { "/api/parties/party-1": party1 });

    const { unmount } = renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    expect(screen.getByText(`¥${SET_PRICE_YEN.toLocaleString()}`)).toBeInTheDocument();
    unmount();
  });

  it("shows rounded-up cost for uneven splits (3 members)", async () => {
    const party3 = makePartyData({
      members: [
        makeMember("u1", "User1"),
        makeMember("u2", "User2"),
        makeMember("u3", "User3"),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party3 });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    // ceil(21600/3) = 7200
    expect(screen.getByText("¥7,200")).toBeInTheDocument();
  });
});

describe("PartyDetail — error and loading states", () => {
  it("shows loading spinner while fetching", () => {
    setupFetchMock(null, {});
    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state when party fetch fails", async () => {
    setupFetchMock(null);
    renderWithProviders(<PartyDetail />, { route: "/parties/nonexistent", routePath: "/parties/:partyId" });
    await waitFor(() => {
      // useFetch throws on non-200 status, showing the error message
      expect(screen.getByText(/HTTP 404|Party not found/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Back to parties" })).toBeInTheDocument();
  });
});

describe("PartyDetail — full party scenario (12 members, all claimed)", () => {
  it("shows 12/12 claimed and all characters in Claimed state", async () => {
    const members = Array.from({ length: 12 }, (_, i) =>
      makeMember(`u${i + 1}`, `User${i + 1}`),
    );
    const claims = Array.from({ length: 12 }, (_, i) =>
      makeClaim(i + 1, `u${i + 1}`, `User${i + 1}`, "claimed"),
    );
    const party = makePartyData({ members, claims });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });

    // All characters should be "Claimed"
    const claimedBadges = screen.getAllByText("Claimed");
    // 12 character badges + 1 stats label = 13
    expect(claimedBadges.length).toBeGreaterThanOrEqual(12);

    // Cost per person with 12 members: 21600/12 = 1800
    expect(screen.getByText("¥1,800")).toBeInTheDocument();
  });
});

describe("PartyDetail — preferences display", () => {
  it("shows interested count for characters with only preferences", async () => {
    const party = makePartyData({
      members: [
        makeMember("user-1", "TestUser", [1, 3]),
        makeMember("user-2", "User2", [1]),
      ],
    });
    setupFetchMock(null, { "/api/parties/party-1": party });

    renderWithProviders(<PartyDetail />, { route: "/parties/party-1", routePath: "/parties/:partyId" });
    await waitFor(() => {
      expect(screen.getByText("Test Party")).toBeInTheDocument();
    });
    // Character 1 (Ayumu) has 2 preferences
    expect(screen.getByText("2 interested")).toBeInTheDocument();
    // Character 3 (Shizuku) has 1 preference
    expect(screen.getByText("1 interested")).toBeInTheDocument();
  });
});
