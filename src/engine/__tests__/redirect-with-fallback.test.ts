import { describe, it, expect } from "vitest";
import { redirectWithFallback } from "../../../worker/redirect-with-fallback";

describe("redirectWithFallback", () => {
  const testUrl = "https://discord.com/api/oauth2/authorize?client_id=123&state=abc";

  it("returns a 302 status", () => {
    const res = redirectWithFallback(testUrl);
    expect(res.status).toBe(302);
  });

  it("sets the Location header to the target URL", () => {
    const res = redirectWithFallback(testUrl);
    expect(res.headers.get("Location")).toBe(testUrl);
  });

  it("returns HTML content type", () => {
    const res = redirectWithFallback(testUrl);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("includes meta-refresh tag pointing to the target URL", async () => {
    const res = redirectWithFallback(testUrl);
    const html = await res.text();
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${testUrl}">`);
  });

  it("includes a clickable fallback link", async () => {
    const res = redirectWithFallback(testUrl);
    const html = await res.text();
    expect(html).toContain(`<a href="${testUrl}">`);
    expect(html).toContain("Click here if you are not redirected");
  });

  it("includes Redirecting text visible to the user", async () => {
    const res = redirectWithFallback(testUrl);
    const html = await res.text();
    expect(html).toContain("Redirecting");
  });

  it("sets cookies when provided", () => {
    const res = redirectWithFallback(testUrl, {
      cookies: [
        "oauth_state=xyz; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600",
      ],
    });
    expect(res.headers.get("Set-Cookie")).toContain("oauth_state=xyz");
  });

  it("sets multiple cookies when provided", () => {
    const res = redirectWithFallback(testUrl, {
      cookies: [
        "cookie_a=1; Path=/",
        "cookie_b=2; Path=/",
      ],
    });
    // Headers.getSetCookie() returns array of Set-Cookie values
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toContain("cookie_a=1; Path=/");
    expect(setCookies).toContain("cookie_b=2; Path=/");
  });

  it("works without cookies option", () => {
    const res = redirectWithFallback(testUrl);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("includes mobile viewport meta tag", async () => {
    const res = redirectWithFallback(testUrl);
    const html = await res.text();
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });

  it("is a valid HTML document", async () => {
    const res = redirectWithFallback(testUrl);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
  });
});
