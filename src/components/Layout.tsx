import { Link, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import type { Language } from "../shared/types";

const LANGUAGES: { code: Language; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export function Layout() {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
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
        </nav>
      </header>
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
