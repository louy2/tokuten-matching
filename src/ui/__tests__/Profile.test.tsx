import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profile } from "../../pages/Profile";
import { renderWithProviders, setupFetchMock } from "./helpers";
import type { AuthUser } from "../../shared/types";
import { CHARACTERS } from "../../shared/characters";

const userWithPrefs: AuthUser = {
  id: "user-1",
  displayName: "TestUser",
  avatarUrl: null,
  characterPreferences: [1, 3, 5],
};

const userNoPrefs: AuthUser = {
  id: "user-1",
  displayName: "TestUser",
  avatarUrl: null,
  characterPreferences: [],
};

const userWithAvatar: AuthUser = {
  id: "user-1",
  displayName: "TestUser",
  avatarUrl: "https://example.com/avatar.png",
  characterPreferences: [],
};

describe("Profile — login required", () => {
  it("shows login required message when not authenticated", async () => {
    setupFetchMock(null);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Profile")).toBeInTheDocument();
    });
    expect(screen.getByText("Log in to view your profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });
});

describe("Profile — user info display", () => {
  it("shows user display name and truncated ID", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("TestUser")).toBeInTheDocument();
    });
    expect(screen.getByText(/User ID: user-1\.\.\./)).toBeInTheDocument();
  });

  it("shows avatar initial in circle", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("TestUser")).toBeInTheDocument();
    });
    // "T" is the first letter of "TestUser"
    const initials = screen.getAllByText("T");
    expect(initials.length).toBeGreaterThanOrEqual(1);
  });

  it("shows avatar image when user has avatarUrl", async () => {
    setupFetchMock(userWithAvatar);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("TestUser")).toBeInTheDocument();
    });
    const img = screen.getByRole("img", { name: "TestUser" });
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
  });
});

describe("Profile — character preferences", () => {
  it("shows Character Preferences section", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Character Preferences")).toBeInTheDocument();
    });
    expect(screen.getByText(/Rank the characters you want/)).toBeInTheDocument();
  });

  it("shows empty preferences message when none set", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("No preferences set yet. Tap a character above to add.")).toBeInTheDocument();
    });
  });

  it("shows ordered preferences with rank numbers", async () => {
    setupFetchMock(userWithPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Ayumu Uehara")).toBeInTheDocument();
    });
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByText("Shizuku Osaka")).toBeInTheDocument();
    expect(screen.getByText("Ai Miyashita")).toBeInTheDocument();
  });

  it("shows unselected characters as addable buttons", async () => {
    setupFetchMock(userWithPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Add a character")).toBeInTheDocument();
    });
    // Characters 1, 3, 5 are selected; the rest should be addable
    const unselected = CHARACTERS.filter((c) => ![1, 3, 5].includes(c.id));
    for (const char of unselected) {
      expect(screen.getByRole("button", { name: new RegExp(char.nameEn) })).toBeInTheDocument();
    }
  });

  it("shows all 12 characters as addable when no preferences set", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Add a character")).toBeInTheDocument();
    });
    for (const char of CHARACTERS) {
      expect(screen.getByRole("button", { name: new RegExp(char.nameEn) })).toBeInTheDocument();
    }
  });

  it("shows move up/down and remove buttons for each preference", async () => {
    setupFetchMock(userWithPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Ayumu Uehara")).toBeInTheDocument();
    });
    // 3 preferences = 3 up arrows, 3 down arrows, 3 remove buttons
    const upButtons = screen.getAllByRole("button", { name: "↑" });
    const downButtons = screen.getAllByRole("button", { name: "↓" });
    const removeButtons = screen.getAllByRole("button", { name: "×" });
    expect(upButtons.length).toBe(3);
    expect(downButtons.length).toBe(3);
    expect(removeButtons.length).toBe(3);
  });

  it("disables up button for first preference", async () => {
    setupFetchMock(userWithPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Ayumu Uehara")).toBeInTheDocument();
    });
    const upButtons = screen.getAllByRole("button", { name: "↑" });
    expect(upButtons[0]).toBeDisabled();
  });

  it("disables down button for last preference", async () => {
    setupFetchMock(userWithPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Ayumu Uehara")).toBeInTheDocument();
    });
    const downButtons = screen.getAllByRole("button", { name: "↓" });
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });

  it("calls PUT /api/profile when adding a preference", async () => {
    const fetchMock = setupFetchMock(userNoPrefs, {
      "/api/profile": { ok: true },
    });
    const user = userEvent.setup();

    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Ayumu Uehara/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Ayumu Uehara/ }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse((putCalls[0][1] as RequestInit).body as string);
      expect(body.characterPreferences).toContain(1);
    });
  });

  it("calls PUT /api/profile when removing a preference", async () => {
    const fetchMock = setupFetchMock(userWithPrefs, {
      "/api/profile": { ok: true },
    });
    const user = userEvent.setup();

    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByText("Ayumu Uehara")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: "×" });
    await user.click(removeButtons[0]); // Remove first preference (Ayumu)

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse((putCalls[0][1] as RequestInit).body as string);
      expect(body.characterPreferences).not.toContain(1);
      expect(body.characterPreferences).toContain(3);
      expect(body.characterPreferences).toContain(5);
    });
  });
});

describe("Profile — logout", () => {
  it("shows logout button", async () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
    });
  });
});

describe("Profile — loading state", () => {
  it("shows loading spinner while auth is loading", () => {
    setupFetchMock(userNoPrefs);
    renderWithProviders(<Profile />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
