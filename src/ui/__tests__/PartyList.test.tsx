import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyList } from "../../pages/PartyList";
import { renderWithProviders, setupFetchMock, setupFetchErrorMock, mockUser, mockLeader } from "./helpers";

const openParties = {
  parties: [
    {
      id: "p1",
      name: "Tokyo Fans",
      languages: '["ja"]',
      createdAt: "2025-01-01",
      memberCount: 5,
      claimedCount: 3,
    },
    {
      id: "p2",
      name: "Global Squad",
      languages: '["en","ja"]',
      createdAt: "2025-01-02",
      memberCount: 8,
      claimedCount: 6,
    },
  ],
};

const jaParties = {
  parties: [
    {
      id: "p1",
      name: "Tokyo Fans",
      languages: '["ja"]',
      createdAt: "2025-01-01",
      memberCount: 5,
      claimedCount: 3,
    },
  ],
};

const emptyParties = { parties: [] };

const partiesWithClaims = {
  parties: [
    {
      id: "p1",
      name: "Party A",
      languages: '["ja"]',
      createdAt: "2025-01-01",
      memberCount: 3,
      claimedCount: 2,
      claimedCharacterIds: "[1,3]",
    },
    {
      id: "p2",
      name: "Party B",
      languages: '["en"]',
      createdAt: "2025-01-02",
      memberCount: 5,
      claimedCount: 3,
      claimedCharacterIds: "[1,2,5]",
    },
    {
      id: "p3",
      name: "Party C",
      languages: '["ja"]',
      createdAt: "2025-01-03",
      memberCount: 12,
      claimedCount: 12,
      claimedCharacterIds: "[1,2,3,4,5,6,7,8,9,10,11,12]",
    },
  ],
};

describe("PartyList — character filtering", () => {
  beforeEach(() => {
    setupFetchMock(null, { "/api/parties": partiesWithClaims });
  });

  it("renders character filter buttons for all 12 characters", async () => {
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Ayumu Uehara" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kasumi Nakasu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lanzhu Zhong" })).toBeInTheDocument();
  });

  it("shows all parties when no character filter is selected", async () => {
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });

  it("filters to parties where selected character is open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Click "Shizuku Osaka" (id=3) — claimed in Party A, open in Party B, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Shizuku Osaka" }));

    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.queryByText("Party A")).not.toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });

  it("filters with multiple selected characters (OR logic)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Click "Kasumi Nakasu" (id=2) — open in Party A, claimed in Party B, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Kasumi Nakasu" }));
    // Click "Ai Miyashita" (id=5) — open in Party A, claimed in Party B, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Ai Miyashita" }));

    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.queryByText("Party B")).not.toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });

  it("deselects a character filter on second click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Shizuku Osaka" }));
    expect(screen.queryByText("Party A")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Shizuku Osaka" }));
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });

  it("combines language and character filters", async () => {
    const user = userEvent.setup();
    setupFetchMock(null, {
      "/api/parties": partiesWithClaims,
      "/api/parties?language=ja": {
        parties: partiesWithClaims.parties.filter((p) =>
          JSON.parse(p.languages).includes("ja"),
        ),
      },
    });
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Filter by Japanese language
    await user.click(screen.getByRole("button", { name: "Japanese" }));
    await waitFor(() => {
      expect(screen.queryByText("Party B")).not.toBeInTheDocument();
    });

    // Also filter by character 2 (Kasumi) — open in Party A, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Kasumi Nakasu" }));
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });
});

describe("PartyList — from profile character filter", () => {
  it("renders a 'From Profile' button when user has preferences", async () => {
    setupFetchMock(mockLeader, { "/api/parties": partiesWithClaims });
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "From Profile" })).toBeInTheDocument();
  });

  it("applies user's character preferences as filters when clicked", async () => {
    // mockLeader has characterPreferences: [1, 3, 5]
    setupFetchMock(mockLeader, { "/api/parties": partiesWithClaims });
    const user = userEvent.setup();
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "From Profile" }));

    // Character 1 claimed in both A & B, character 3 claimed in A only, character 5 claimed in B only
    // Party A: char 1 claimed, char 3 claimed, char 5 open → has open match → visible
    // Party B: char 1 claimed, char 3 open, char 5 claimed → has open match → visible
    // Party C: all claimed → no open match → hidden
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });

  it("clears character filter when 'From Profile' is clicked again", async () => {
    setupFetchMock(mockLeader, { "/api/parties": partiesWithClaims });
    const user = userEvent.setup();
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "From Profile" }));
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "From Profile" }));
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });

  it("does not show 'From Profile' button when user has no preferences", async () => {
    setupFetchMock(mockUser, { "/api/parties": partiesWithClaims });
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "From Profile" })).not.toBeInTheDocument();
  });

  it("does not show 'From Profile' button when user is not logged in", async () => {
    setupFetchMock(null, { "/api/parties": partiesWithClaims });
    renderWithProviders(<PartyList />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "From Profile" })).not.toBeInTheDocument();
  });
});

describe("PartyList — BROWSE scenarios", () => {
  describe("party discovery", () => {
    beforeEach(() => {
      setupFetchMock(null, {
        "/api/parties": openParties,
      });
    });

    it("shows parties with name, languages, member count, and open slots", async () => {
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("Tokyo Fans")).toBeInTheDocument();
      });
      expect(screen.getByText("Global Squad")).toBeInTheDocument();
      // 日本語 appears in both parties' language badges
      expect(screen.getAllByText("日本語").length).toBeGreaterThanOrEqual(1);
      // Open slots = 12 - claimedCount
      expect(screen.getByText("9 open")).toBeInTheDocument(); // 12 - 3
      expect(screen.getByText("6 open")).toBeInTheDocument(); // 12 - 6
    });

    it("shows member count for each party", async () => {
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("5 members")).toBeInTheDocument();
      });
      expect(screen.getByText("8 members")).toBeInTheDocument();
    });

    it("links each party to its detail page", async () => {
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("Tokyo Fans")).toBeInTheDocument();
      });
      const link = screen.getByText("Tokyo Fans").closest("a");
      expect(link).toHaveAttribute("href", "/parties/p1");
    });

    it("shows multilingual party with all language badges", async () => {
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("Global Squad")).toBeInTheDocument();
      });
      // Global Squad has both "en" and "ja"
      const card = screen.getByText("Global Squad").closest("a")!;
      expect(card).toContainHTML("English");
      expect(card).toContainHTML("日本語");
    });
  });

  describe("language filtering", () => {
    it("renders all 4 language filter buttons", () => {
      setupFetchMock(null, { "/api/parties": openParties });
      renderWithProviders(<PartyList />);
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Japanese" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chinese" })).toBeInTheDocument();
    });

    it("filters by language when a filter button is clicked", async () => {
      const fetchMock = setupFetchMock(null, {
        "/api/parties": openParties,
        "/api/parties?language=ja": jaParties,
      });
      const user = userEvent.setup();

      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("Tokyo Fans")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Japanese" }));

      await waitFor(() => {
        // Verify the fetch was called with the language filter
        const calls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(calls.some((url: string) => url.includes("language=ja"))).toBe(true);
      });
    });
  });

  describe("empty state", () => {
    it("shows empty message when no parties are found", async () => {
      setupFetchMock(null, { "/api/parties": emptyParties });
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("No parties found. Create one to get started!")).toBeInTheDocument();
      });
    });

    it("shows a link to create party in empty state", async () => {
      setupFetchMock(null, { "/api/parties": emptyParties });
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Create a Party" })).toBeInTheDocument();
      });
    });
  });

  describe("loading and error states", () => {
    it("shows loading spinner initially", () => {
      setupFetchMock(null, { "/api/parties": openParties });
      renderWithProviders(<PartyList />);
      // The spinner has the animate-spin class
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("shows error message when fetch fails", async () => {
      setupFetchErrorMock(null, {
        "/api/parties": { status: 500, error: "Internal server error" },
      });
      renderWithProviders(<PartyList />);
      await waitFor(() => {
        expect(screen.getByText("HTTP 500")).toBeInTheDocument();
      });
    });
  });
});
