import { Link, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import type { Language } from "../shared/types";

const LANGUAGES: { code: Language; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export function Layout() {
  const { t, i18n } = useTranslation();
  const { user, loading, login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">
            {t("appName")}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/parties" className="hover:underline">
              {t("nav.parties")}
            </Link>
            <Link to="/my-parties" className="hover:underline">
              {t("nav.myParties")}
            </Link>
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="bg-transparent border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-sm"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            {!loading && (
              user ? (
                <Link
                  to="/profile"
                  className="flex items-center gap-1.5 hover:opacity-80"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                </Link>
              ) : (
                <button
                  onClick={login}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                >
                  {t("common.login")}
                </button>
              )
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 text-center text-xs text-gray-400">
        {t("footer.text")}
      </footer>
    </div>
  );
}
