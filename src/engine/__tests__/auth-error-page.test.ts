import { describe, it, expect } from "vitest";
import { authErrorPage } from "../../../worker/auth-error-page";

describe("authErrorPage", () => {
  it("returns a Response with the given status code", () => {
    const res = authErrorPage("Test Title", "Test detail", 400);
    expect(res.status).toBe(400);
  });

  it("returns HTML content type", () => {
    const res = authErrorPage("Title", "Detail", 502);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("includes the title in the HTML body", async () => {
    const res = authErrorPage("Login failed", "Detail", 400);
    const html = await res.text();
    expect(html).toContain("Login failed");
  });

  it("includes the detail message in the HTML body", async () => {
    const res = authErrorPage("Title", "Session state mismatch — try disabling Shields", 400);
    const html = await res.text();
    expect(html).toContain("Session state mismatch");
    expect(html).toContain("disabling Shields");
  });

  it("includes a back to home link", async () => {
    const res = authErrorPage("Title", "Detail", 400);
    const html = await res.text();
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to home");
  });

  it("is a valid HTML document", async () => {
    const res = authErrorPage("Title", "Detail", 400);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
  });

  it("includes viewport meta tag for mobile", async () => {
    const res = authErrorPage("Title", "Detail", 400);
    const html = await res.text();
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });
});
