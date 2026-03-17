import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyParties } from "../../pages/MyParties";
import { renderWithProviders, setupFetchMock, mockUser, mockLeader } from "./helpers";

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

describe("MyParties — language filtering", () => {
  const mixedParties = {
    parties: [
      {
        id: "p1",
        name: "Japanese Party",
        status: "open",
        languages: '["ja"]',
        leaderId: "user-1",
        memberCount: 3,
        claimedCount: 1,
      },
      {
        id: "p2",
        name: "English Party",
        status: "open",
        languages: '["en"]',
        leaderId: "other",
        memberCount: 5,
        claimedCount: 2,
      },
      {
        id: "p3",
        name: "Bilingual Party",
        status: "locked",
        languages: '["ja","en"]',
        leaderId: "other2",
        memberCount: 12,
        claimedCount: 12,
      },
    ],
  };

  beforeEach(() => {
    setupFetchMock(mockUser, { "/api/my-parties": mixedParties });
  });

  it("renders all 4 language filter buttons", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Japanese" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chinese" })).toBeInTheDocument();
  });

  it("shows all parties by default", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });
    expect(screen.getByText("English Party")).toBeInTheDocument();
    expect(screen.getByText("Bilingual Party")).toBeInTheDocument();
  });

  it("filters parties when Japanese filter is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Japanese" }));

    // Japanese Party and Bilingual Party (has ja) should be visible
    expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    expect(screen.getByText("Bilingual Party")).toBeInTheDocument();
    // English-only party should be hidden
    expect(screen.queryByText("English Party")).not.toBeInTheDocument();
  });

  it("filters parties when English filter is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("English Party")).toBeInTheDocument();
    expect(screen.getByText("Bilingual Party")).toBeInTheDocument();
    expect(screen.queryByText("Japanese Party")).not.toBeInTheDocument();
  });

  it("shows all parties again when All filter is clicked after filtering", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });

    // Filter to Japanese first
    await user.click(screen.getByRole("button", { name: "Japanese" }));
    expect(screen.queryByText("English Party")).not.toBeInTheDocument();

    // Click All to reset
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    expect(screen.getByText("English Party")).toBeInTheDocument();
    expect(screen.getByText("Bilingual Party")).toBeInTheDocument();
  });

  it("highlights the active filter button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Japanese Party")).toBeInTheDocument();
    });

    // All button should be active by default
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(allBtn.className).toContain("bg-blue-600");

    // Click Japanese filter
    await user.click(screen.getByRole("button", { name: "Japanese" }));
    const jaBtn = screen.getByRole("button", { name: "Japanese" });
    expect(jaBtn.className).toContain("bg-blue-600");
    expect(allBtn.className).not.toContain("bg-blue-600");
  });
});

describe("MyParties — character filtering", () => {
  // Party A: characters 1,3 claimed → open: 2,4,5,6,7,8,9,10,11,12
  // Party B: characters 1,2,5 claimed → open: 3,4,6,7,8,9,10,11,12
  // Party C: all 12 claimed → open: none
  const partiesWithClaims = {
    parties: [
      {
        id: "p1",
        name: "Party A",
        status: "open",
        languages: '["ja"]',
        leaderId: "user-1",
        memberCount: 3,
        claimedCount: 2,
        claimedCharacterIds: "[1,3]",
      },
      {
        id: "p2",
        name: "Party B",
        status: "open",
        languages: '["en"]',
        leaderId: "other",
        memberCount: 5,
        claimedCount: 3,
        claimedCharacterIds: "[1,2,5]",
      },
      {
        id: "p3",
        name: "Party C",
        status: "locked",
        languages: '["ja"]',
        leaderId: "other2",
        memberCount: 12,
        claimedCount: 12,
        claimedCharacterIds: "[1,2,3,4,5,6,7,8,9,10,11,12]",
      },
    ],
  };

  beforeEach(() => {
    setupFetchMock(mockUser, { "/api/my-parties": partiesWithClaims });
  });

  it("renders character filter buttons for all 12 characters", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    // In English, character names are rendered
    expect(screen.getByRole("button", { name: "Ayumu Uehara" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kasumi Nakasu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lanzhu Zhong" })).toBeInTheDocument();
  });

  it("shows all parties when no character filter is selected", async () => {
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });

  it("filters to parties where selected character is open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
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
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Click "Kasumi Nakasu" (id=2) — open in Party A, claimed in Party B, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Kasumi Nakasu" }));
    // Click "Ai Miyashita" (id=5) — open in Party A, claimed in Party B, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Ai Miyashita" }));

    // Only Party A has either character 2 or 5 open
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.queryByText("Party B")).not.toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });

  it("deselects a character filter on second click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Select then deselect character 3
    await user.click(screen.getByRole("button", { name: "Shizuku Osaka" }));
    expect(screen.queryByText("Party A")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Shizuku Osaka" }));
    // All parties visible again
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.getByText("Party B")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
  });

  it("combines language and character filters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party A")).toBeInTheDocument();
    });

    // Filter by Japanese language
    await user.click(screen.getByRole("button", { name: "Japanese" }));
    // Party A (ja) and Party C (ja) visible, Party B (en) hidden
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.getByText("Party C")).toBeInTheDocument();
    expect(screen.queryByText("Party B")).not.toBeInTheDocument();

    // Also filter by character 2 (Kasumi) — open in Party A, claimed in Party C
    await user.click(screen.getByRole("button", { name: "Kasumi Nakasu" }));
    expect(screen.getByText("Party A")).toBeInTheDocument();
    expect(screen.queryByText("Party C")).not.toBeInTheDocument();
  });
});

describe("MyParties — from profile character filter", () => {
  const partiesWithClaims = {
    parties: [
      {
        id: "p1",
        name: "Party X",
        status: "open",
        languages: '["ja"]',
        leaderId: "leader-1",
        memberCount: 3,
        claimedCount: 2,
        claimedCharacterIds: "[1,3]",
      },
      {
        id: "p2",
        name: "Party Y",
        status: "open",
        languages: '["en"]',
        leaderId: "other",
        memberCount: 5,
        claimedCount: 3,
        claimedCharacterIds: "[1,3,5]",
      },
    ],
  };

  it("renders a 'From Profile' button", async () => {
    setupFetchMock(mockLeader, { "/api/my-parties": partiesWithClaims });
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party X")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "From Profile" })).toBeInTheDocument();
  });

  it("applies user's character preferences as filters when clicked", async () => {
    // mockLeader has characterPreferences: [1, 3, 5]
    setupFetchMock(mockLeader, { "/api/my-parties": partiesWithClaims });
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party X")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "From Profile" }));

    // Character 1 is claimed in both parties
    // Character 3 is claimed in both parties
    // Character 5 is open in Party X, claimed in Party Y
    // So only Party X has any of [1,3,5] open (character 5)
    expect(screen.getByText("Party X")).toBeInTheDocument();
    expect(screen.queryByText("Party Y")).not.toBeInTheDocument();
  });

  it("clears character filter when 'From Profile' is clicked again", async () => {
    setupFetchMock(mockLeader, { "/api/my-parties": partiesWithClaims });
    const user = userEvent.setup();
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party X")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "From Profile" }));
    expect(screen.queryByText("Party Y")).not.toBeInTheDocument();

    // Click again to clear
    await user.click(screen.getByRole("button", { name: "From Profile" }));
    expect(screen.getByText("Party X")).toBeInTheDocument();
    expect(screen.getByText("Party Y")).toBeInTheDocument();
  });

  it("does not show 'From Profile' button when user has no preferences", async () => {
    // mockUser has characterPreferences: []
    setupFetchMock(mockUser, { "/api/my-parties": partiesWithClaims });
    renderWithProviders(<MyParties />);
    await waitFor(() => {
      expect(screen.getByText("Party X")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "From Profile" })).not.toBeInTheDocument();
  });
});
