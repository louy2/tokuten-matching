import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyList } from "../../pages/PartyList";
import { renderWithProviders, setupFetchMock, setupFetchErrorMock, mockUser } from "./helpers";

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
