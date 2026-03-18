import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let sessionStore: Record<string, string>;

  beforeEach(() => {
    sessionStore = {};
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => sessionStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => { sessionStore[key] = val; }),
      removeItem: vi.fn((key: string) => { delete sessionStore[key]; }),
    });
    vi.stubGlobal("addEventListener", vi.fn());
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("exports log object with debug, info, warn, error methods", async () => {
    const { log } = await import("../../lib/logger");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("buffers log entries to sessionStorage", async () => {
    const { log } = await import("../../lib/logger");
    log.info("test message", { key: "value" });
    const stored = JSON.parse(sessionStore["tokuten_logs"]);
    expect(stored.length).toBeGreaterThanOrEqual(1);
    const entry = stored.find((e: { message: string }) => e.message === "test message");
    expect(entry).toBeDefined();
    expect(entry.level).toBe("info");
    expect(entry.data).toEqual({ key: "value" });
    expect(entry.timestamp).toBeDefined();
  });

  it("logs to console.info for info level", async () => {
    const { log } = await import("../../lib/logger");
    log.info("hello");
    expect(console.info).toHaveBeenCalledWith("[INFO] hello", "");
  });

  it("logs to console.error for error level", async () => {
    const { log } = await import("../../lib/logger");
    log.error("bad thing", { detail: "oops" });
    expect(console.error).toHaveBeenCalledWith("[ERROR] bad thing", { detail: "oops" });
  });

  it("logs to console.warn for warn level", async () => {
    const { log } = await import("../../lib/logger");
    log.warn("warning");
    expect(console.warn).toHaveBeenCalledWith("[WARN] warning", "");
  });

  it("caps buffered logs at 50 entries", async () => {
    const { log } = await import("../../lib/logger");
    for (let i = 0; i < 60; i++) {
      log.info(`msg-${i}`);
    }
    const stored = JSON.parse(sessionStore["tokuten_logs"]);
    expect(stored.length).toBe(50);
    // Should keep the most recent, so last entry should be msg-59
    expect(stored[stored.length - 1].message).toBe("msg-59");
  });

  it("getBufferedLogs returns all stored entries", async () => {
    const { log } = await import("../../lib/logger");
    log.info("one");
    log.warn("two");
    const buffered = log.getBufferedLogs();
    const messages = buffered.map((e: { message: string }) => e.message);
    expect(messages).toContain("one");
    expect(messages).toContain("two");
  });

  it("includes url and userAgent in log entries", async () => {
    const { log } = await import("../../lib/logger");
    log.info("with context");
    const stored = JSON.parse(sessionStore["tokuten_logs"]);
    const entry = stored.find((e: { message: string }) => e.message === "with context");
    expect(entry.url).toBeDefined();
    expect(entry.userAgent).toBeDefined();
  });

  it("registers global error handlers on import", async () => {
    await import("../../lib/logger");
    expect(window.addEventListener).toHaveBeenCalledWith("error", expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });
});
