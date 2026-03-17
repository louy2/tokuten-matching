import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateParty } from "../../pages/CreateParty";
import { renderWithProviders, setupFetchMock, mockUser } from "./helpers";

describe("CreateParty — login required", () => {
  it("shows login required message when not authenticated", async () => {
    setupFetchMock(null);
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByText("Create a Party")).toBeInTheDocument();
    });
    expect(screen.getByText("Log in to create a party.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });
});

describe("CreateParty — form rendering", () => {
  beforeEach(() => {
    setupFetchMock(mockUser);
  });

  it("shows the form with all fields when authenticated", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByText("Party Name")).toBeInTheDocument();
    });
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Languages")).toBeInTheDocument();
    expect(screen.getByText("Group Chat Link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Party" })).toBeInTheDocument();
  });

  it("shows party name input with placeholder", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Niji Tokuten Squad")).toBeInTheDocument();
    });
  });

  it("shows description textarea with placeholder", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Tell people about your party...")).toBeInTheDocument();
    });
  });

  it("shows group chat link input with placeholder", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://discord.gg/... or https://line.me/...")).toBeInTheDocument();
    });
    expect(screen.getByText("Discord, LINE, or other group chat invite link")).toBeInTheDocument();
  });

  it("shows all 3 language toggle buttons", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "日本語" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toBeInTheDocument();
  });

  it("has Japanese pre-selected by default", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      const jaBtn = screen.getByRole("button", { name: "日本語" });
      expect(jaBtn.className).toContain("bg-blue-600");
    });
  });
});

describe("CreateParty — language toggle", () => {
  beforeEach(() => {
    setupFetchMock(mockUser);
  });

  it("toggles a language on when clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "English" }));
    const enBtn = screen.getByRole("button", { name: "English" });
    expect(enBtn.className).toContain("bg-blue-600");
  });

  it("toggles a language off when clicked again", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      const jaBtn = screen.getByRole("button", { name: "日本語" });
      expect(jaBtn.className).toContain("bg-blue-600");
    });

    await user.click(screen.getByRole("button", { name: "日本語" }));
    const jaBtn = screen.getByRole("button", { name: "日本語" });
    expect(jaBtn.className).not.toContain("bg-blue-600");
  });
});

describe("CreateParty — form validation", () => {
  beforeEach(() => {
    setupFetchMock(mockUser);
  });

  it("submit button is disabled when party name is empty", async () => {
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Party" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Create Party" })).toBeDisabled();
  });

  it("submit button is enabled when party name is filled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Niji Tokuten Squad")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("e.g. Niji Tokuten Squad"), "My Party");
    expect(screen.getByRole("button", { name: "Create Party" })).toBeEnabled();
  });

  it("submit button is disabled when no languages are selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Niji Tokuten Squad")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("e.g. Niji Tokuten Squad"), "My Party");
    // Deselect Japanese (the only selected language)
    await user.click(screen.getByRole("button", { name: "日本語" }));
    expect(screen.getByRole("button", { name: "Create Party" })).toBeDisabled();
  });
});

describe("CreateParty — form submission", () => {
  it("calls POST /api/parties/create with form data", async () => {
    const fetchMock = setupFetchMock(mockUser, {
      "/api/parties/create": { partyId: "new-party-id" },
    });
    const user = userEvent.setup();

    renderWithProviders(<CreateParty />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Niji Tokuten Squad")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("e.g. Niji Tokuten Squad"), "Test Squad");
    await user.type(screen.getByPlaceholderText("Tell people about your party..."), "A fun party");
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Create Party" }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === "object" && (c[1] as RequestInit).method === "POST",
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
      expect(body.name).toBe("Test Squad");
      expect(body.description).toBe("A fun party");
      expect(body.languages).toContain("ja");
      expect(body.languages).toContain("en");
    });
  });
});
