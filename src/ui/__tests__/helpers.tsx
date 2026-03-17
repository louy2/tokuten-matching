import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../i18n/en.json";
import type { AuthUser } from "../../shared/types";
import { AuthProvider } from "../../hooks/useAuth";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

// Initialize i18n for tests (English only for readable assertions)
const testI18n = i18n.createInstance();
testI18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export { testI18n };

export const mockUser: AuthUser = {
  id: "user-1",
  displayName: "TestUser",
  avatarUrl: null,
  characterPreferences: [],
};

export const mockLeader: AuthUser = {
  id: "leader-1",
  displayName: "LeaderUser",
  avatarUrl: null,
  characterPreferences: [1, 3, 5],
};

/**
 * Sets up global.fetch mock to handle /api/auth/me and custom routes.
 * Routes are matched longest-first to avoid greedy matching.
 */
export function setupFetchMock(user: AuthUser | null = null, routes: Record<string, unknown> = {}) {
  // Sort routes longest-first so more specific routes match before general ones
  const sortedRoutes = Object.entries(routes).sort(([a], [b]) => b.length - a.length);

  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/api/auth/me")) {
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const [route, data] of sortedRoutes) {
      if (url.includes(route)) {
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Sets up fetch mock that returns an error for a specific route.
 */
export function setupFetchErrorMock(user: AuthUser | null = null, errorRoutes: Record<string, { status: number; error: string }> = {}) {
  const sortedRoutes = Object.entries(errorRoutes).sort(([a], [b]) => b.length - a.length);

  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/api/auth/me")) {
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const [route, errData] of sortedRoutes) {
      if (url.includes(route)) {
        return new Response(JSON.stringify({ error: errData.error }), {
          status: errData.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

interface WrapperOptions {
  route?: string;
  /** Route path pattern for useParams matching, e.g. "/parties/:partyId" */
  routePath?: string;
}

function createWrapper(options: WrapperOptions = {}) {
  const { route = "/" } = options;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={testI18n}>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>
            {children}
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>
    );
  };
}

/**
 * Render with route pattern support for useParams.
 * If routePath is provided, wraps the component in Routes/Route.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: WrapperOptions & Omit<RenderOptions, "wrapper"> = {},
) {
  const { route, routePath, ...renderOptions } = options;

  if (routePath) {
    // Wrap the element in Routes/Route so useParams works
    const wrappedUi = (
      <Routes>
        <Route path={routePath} element={ui} />
      </Routes>
    );
    return render(wrappedUi, {
      wrapper: createWrapper({ route }),
      ...renderOptions,
    });
  }

  return render(ui, {
    wrapper: createWrapper({ route }),
    ...renderOptions,
  });
}
