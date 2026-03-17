import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Layout } from "../../components/Layout";
import { renderWithProviders, setupFetchMock, mockUser } from "./helpers";

describe("Layout — navigation", () => {
  beforeEach(() => {
    setupFetchMock(null);
  });

  it("renders the app name as a link to home", async () => {
    renderWithProviders(<Layout />);
    await waitFor(() => {
      const homeLink = screen.getByRole("link", { name: "Tokuten Matching" });
      expect(homeLink).toHaveAttribute("href", "/");
    });
  });

  it("shows Parties and My Parties navigation links", async () => {
    renderWithProviders(<Layout />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Parties" })).toHaveAttribute("href", "/parties");
      expect(screen.getByRole("link", { name: "My Parties" })).toHaveAttribute("href", "/my-parties");
    });
  });

  it("shows language selector with 3 options", async () => {
    renderWithProviders(<Layout />);
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveValue("ja");
    expect(options[1]).toHaveValue("en");
    expect(options[2]).toHaveValue("zh");
  });
});

describe("Layout — auth state", () => {
  it("shows Log In button when not authenticated", async () => {
    setupFetchMock(null);
    renderWithProviders(<Layout />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    });
  });

  it("shows user avatar link when authenticated", async () => {
    setupFetchMock(mockUser);
    renderWithProviders(<Layout />);
    await waitFor(() => {
      // Avatar shows the first letter of displayName
      expect(screen.getByText("T")).toBeInTheDocument();
    });
    const profileLink = screen.getByText("T").closest("a");
    expect(profileLink).toHaveAttribute("href", "/profile");
  });
});

describe("Layout — footer", () => {
  it("renders the footer text", async () => {
    setupFetchMock(null);
    renderWithProviders(<Layout />);
    await waitFor(() => {
      expect(screen.getByText(/Tokuten Matching — Split-buy Nijigasaki/)).toBeInTheDocument();
    });
  });
});
