import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { SET_PRICE_YEN, CHARACTERS } from "../shared/characters";
import { useCharacterName } from "../hooks/useCharacterName";

export function Home() {
  const { t } = useTranslation();
  const charName = useCharacterName();

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-3xl font-bold">{t("appName")}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          {t("home.description")}
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/parties"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {t("home.findParty")}
          </Link>
          <Link
            to="/create-party"
            className="px-6 py-3 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800 font-medium"
          >
            {t("home.createParty")}
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-center">{t("home.howItWorks")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["browse", "join", "discuss", "record"] as const).map((step, i) => (
            <div
              key={step}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <h3 className="font-medium">{t(`home.steps.${step}.title`)}</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t(`home.steps.${step}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Price info */}
      <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="text-3xl font-bold">&yen;{SET_PRICE_YEN.toLocaleString()}</div>
        <div className="text-sm text-gray-500 mt-1">{t("home.setPrice")}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {t("home.splitExample", { perPerson: Math.ceil(SET_PRICE_YEN / 12).toLocaleString() })}
        </div>
      </div>

      {/* Character roster */}
      <div>
        <h2 className="text-xl font-semibold text-center mb-4">{t("home.characters")}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {CHARACTERS.map((char) => (
            <div
              key={char.id}
              className="text-center p-3 border rounded-lg"
              style={{ borderColor: `${char.color}40` }}
            >
              <div
                className="w-10 h-10 mx-auto mb-1 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: char.color }}
              >
                {char.id}
              </div>
              <div className="text-xs font-medium truncate">{charName(char.id)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
