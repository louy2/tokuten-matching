type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  url: string;
  userAgent: string;
}

const LOG_BUFFER_KEY = "tokuten_logs";
const MAX_BUFFERED_LOGS = 50;

function getBufferedLogs(): LogEntry[] {
  try {
    const raw = sessionStorage.getItem(LOG_BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function bufferLog(entry: LogEntry) {
  try {
    const logs = getBufferedLogs();
    logs.push(entry);
    // Keep only the most recent entries
    const trimmed = logs.slice(-MAX_BUFFERED_LOGS);
    sessionStorage.setItem(LOG_BUFFER_KEY, JSON.stringify(trimmed));
  } catch {
    // sessionStorage may be unavailable (private browsing, storage full)
  }
}

function createLogEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
}

function emit(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry = createLogEntry(level, message, data);
  bufferLog(entry);

  // Also log to console in development
  const consoleFn = level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "debug" ? console.debug
    : console.info;
  consoleFn(`[${level.toUpperCase()}] ${message}`, data ?? "");
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),

  /** Get all buffered logs (useful for support/debugging) */
  getBufferedLogs,
};

// Capture unhandled errors globally
window.addEventListener("error", (event) => {
  log.error("Unhandled error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    reason: String(event.reason),
  });
});
