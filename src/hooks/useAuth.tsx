import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AuthUser } from "../shared/types";
import { log } from "../lib/logger";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  authSlow: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  authError: null,
  authSlow: false,
  login: () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSlow, setAuthSlow] = useState(false);

  const refresh = useCallback(async () => {
    log.info("Auth refresh started");
    setAuthSlow(false);
    const slowTimer = setTimeout(() => {
      log.warn("Auth check is taking too long");
      setAuthSlow(true);
    }, 5000);
    try {
      const res = await fetch("/api/auth/me");
      log.info("Auth /me response", { status: res.status });
      if (!res.ok) {
        log.warn("Auth /me failed", { status: res.status });
        setUser(null);
        setAuthError(`Auth check failed (${res.status})`);
        return;
      }
      const data = await res.json() as { user: AuthUser | null };
      setUser(data.user);
      setAuthError(null);
      log.info("Auth refresh complete", { hasUser: !!data.user });
    } catch (err) {
      log.error("Auth refresh error", {
        error: err instanceof Error ? err.message : String(err),
      });
      setUser(null);
      setAuthError("Network error during auth check");
    } finally {
      clearTimeout(slowTimer);
      setAuthSlow(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = () => {
    log.info("Login initiated");
    window.location.href = "/api/auth/login";
  };

  const logout = async () => {
    log.info("Logout initiated");
    setUser(null);
    try {
      await fetch("/api/auth/logout", { redirect: "manual" });
    } catch {
      // ignore network errors – cookie/session may already be cleared
    }
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, authSlow, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
