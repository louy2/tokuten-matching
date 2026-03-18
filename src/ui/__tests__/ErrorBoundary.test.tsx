import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../../components/ErrorBoundary";

// A component that throws during render
function ThrowingComponent({ error }: { error: Error }) {
  throw error;
}

// Suppress React's error boundary console.error noise in tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("shows fallback UI when a child component throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("Test crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("mentions browser privacy settings in the fallback message", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("fail")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/browser privacy settings/)).toBeInTheDocument();
  });

  it("shows error details in a collapsible section", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("Specific error message")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Error details")).toBeInTheDocument();
    expect(screen.getByText("Specific error message")).toBeInTheDocument();
  });

  it("has a reload page button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });

  it("has a go to home button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Go to home" })).toBeInTheDocument();
  });

  it("calls window.location.reload when reload button is clicked", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("crash")} />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: "Reload page" }));
    expect(reloadMock).toHaveBeenCalled();
  });
});
