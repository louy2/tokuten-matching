import { Link } from "react-router";
import { useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();

  return (
    <div className="text-center space-y-6">
      <h1 className="text-3xl font-bold">{t("appName")}</h1>
      <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
        {t("home.description")}
      </p>
      <div className="flex gap-4 justify-center">
        <Link
          to="/parties"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t("home.findParty")}
        </Link>
        <button className="px-6 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800">
          {t("home.createParty")}
        </button>
      </div>
    </div>
  );
}
