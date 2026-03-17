import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MyParties } from "../../pages/MyParties";
import { renderWithProviders, setupFetchMock, mockUser } from "./helpers";

describe("MyParties — login required", () => {
  it("shows login required message when not authenticated", async () => {
    setupFetchMock(null);
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My Parties")).toBeInTheDocument();
    });
    expect(screen.getByText("Log in to see your parties.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });
});

describe("MyParties — empty state", () => {
  it("shows empty message when user has no parties", async () => {
    setupFetchMock(mockUser, { "/api/my-parties": { parties: [] } });
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("You haven't joined any parties yet.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Find a Party" })).toHaveAttribute("href", "/parties");
  });
});

describe("MyParties — party list display", () => {
  const myParties = {
    parties: [
      {
        id: "p1",
        name: "My First Party",
        status: "open",
        languages: '["ja"]',
        leaderId: "user-1",
        memberCount: 5,
        claimedCount: 3,
      },
      {
        id: "p2",
        name: "Other Party",
        status: "locked",
        languages: '["en","ja"]',
        leaderId: "other-user",
        memberCount: 12,
        claimedCount: 12,
      },
    ],
  };

  beforeEach(() => {
    setupFetchMock(mockUser, { "/api/my-parties": myParties });
  });

  it("shows all user's parties", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Other Party")).toBeInTheDocument();
  });

  it("shows Leader badge on parties where user is leader", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    // User is leader of "My First Party" (leaderId matches mockUser.id)
    expect(screen.getByText("Leader")).toBeInTheDocument();
  });

  it("shows Open/Locked status badges", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows member count and claimed count", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText("3/12 Claimed")).toBeInTheDocument();
    expect(screen.getByText("12/12 Claimed")).toBeInTheDocument();
  });

  it("shows language badges", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    const jaBadges = screen.getAllByText("日本語");
    expect(jaBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("links each party to its detail page", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("My First Party")).toBeInTheDocument();
    });
    const link = screen.getByText("My First Party").closest("a");
    expect(link).toHaveAttribute("href", "/parties/p1");
  });
});

describe("MyParties — multi-party membership transparency", () => {
  it("shows user's multiple parties to demonstrate multi-party membership", async () => {
    const manyParties = {
      parties: [
        {
          id: "p1",
          name: "Party A",
          status: "open",
          languages: '["ja"]',
          leaderId: "user-1",
          memberCount: 3,
          claimedCount: 1,
        },
        {
          id: "p2",
          name: "Party B",
          status: "open",
          languages: '["en"]',
          leaderId: "other",
          memberCount: 5,
          claimedCount: 2,
        },
        {
          id: "p3",
          name: "Party C",
          status: "locked",
          languages: '["zh"]',
          leaderId: "other2",
          memberCount: 12,
          claimedCount: 12,
        },
      ],
    };
    setupFetchMock(mockUser, { "/api/my-parties": manyParties });
    renderWithProviders(<MyParties />);

    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });
});

describe("MyParties — loading state", () => {
  it("shows loading spinner while fetching", () => {
    setupFetchMock(mockUser, { "/api/my-parties": { parties: [] } });
    renderWithProviders(<MyParties />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
