import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Home } from "../../pages/Home";
import { renderWithProviders, setupFetchMock } from "./helpers";
import { SET_PRICE_YEN, CHARACTERS } from "../../shared/characters";

describe("Home page", () => {
  beforeEach(() => {
    setupFetchMock(null);
  });

  it("renders the app name and description", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("Tokuten Matching")).toBeInTheDocument();
    expect(screen.getByText(/Find a group to split-buy/)).toBeInTheDocument();
  });

  it("shows Find a Party and Create a Party CTA buttons", () => {
    renderWithProviders(<Home />);
    const findLink = screen.getByRole("link", { name: "Find a Party" });
    const createLink = screen.getByRole("link", { name: "Create a Party" });
    expect(findLink).toHaveAttribute("href", "/parties");
    expect(createLink).toHaveAttribute("href", "/create-party");
  });

  it("displays How It Works with all 4 steps (Browse, Join, Discuss, Claim)", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("Join")).toBeInTheDocument();
    expect(screen.getByText("Discuss")).toBeInTheDocument();
    expect(screen.getByText("Claim")).toBeInTheDocument();
  });

  it("shows step numbers 1-4 in the How It Works section", () => {
    renderWithProviders(<Home />);
    // Step numbers appear in colored circles within the steps section
    const stepCircles = document.querySelectorAll(".bg-blue-600.text-white.rounded-full");
    const stepNumbers = Array.from(stepCircles).map((el) => el.textContent?.trim());
    expect(stepNumbers).toContain("1");
    expect(stepNumbers).toContain("2");
    expect(stepNumbers).toContain("3");
    expect(stepNumbers).toContain("4");
  });

  it("shows step descriptions", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText(/Find open parties looking for members/)).toBeInTheDocument();
    expect(screen.getByText(/Join a party and connect/)).toBeInTheDocument();
    expect(screen.getByText(/Talk with your party/)).toBeInTheDocument();
    expect(screen.getByText(/Record your character preferences/)).toBeInTheDocument();
  });

  it("displays the set price ¥21,600", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText(`¥${SET_PRICE_YEN.toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByText("Nijigasaki Tokuten Set")).toBeInTheDocument();
  });

  it("shows the split example for 12 people", () => {
    renderWithProviders(<Home />);
    const perPerson = Math.ceil(SET_PRICE_YEN / 12).toLocaleString();
    expect(screen.getByText(`Split 12 ways = ¥${perPerson} per person`)).toBeInTheDocument();
  });

  it("renders The 12 Characters heading", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("The 12 Characters")).toBeInTheDocument();
  });

  it("renders all 12 character names", () => {
    renderWithProviders(<Home />);
    for (const char of CHARACTERS) {
      expect(screen.getByText(char.nameEn)).toBeInTheDocument();
    }
  });

  it("renders character IDs 1 through 12", () => {
    renderWithProviders(<Home />);
    for (const char of CHARACTERS) {
      // Character IDs appear in the colored circles
      const elements = screen.getAllByText(String(char.id));
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders character color circles with background color", () => {
    renderWithProviders(<Home />);
    // Each character has a colored circle with inline backgroundColor
    const circles = document.querySelectorAll("[style*='background-color']");
    expect(circles.length).toBeGreaterThanOrEqual(12);
  });
});
