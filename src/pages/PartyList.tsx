import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useFetch } from "../hooks/useApi";
import { useCharacterName } from "../hooks/useCharacterName";
import { CHARACTERS } from "../shared/characters";
import type { Language } from "../shared/types";

interface PartyRow {
  id: string;
  name: string;
  languages: string;
  createdAt: string;
  memberCount: number;
  claimedCount?: number;
  claimedCharacterIds?: string | null;
}

function parseJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

const LANGUAGE_OPTIONS: { code: Language | ""; label: string; labelEn: string }[] = [
  { code: "", label: "すべて", labelEn: "All" },
  { code: "ja", label: "日本語", labelEn: "Japanese" },
  { code: "en", label: "English", labelEn: "English" },
  { code: "zh", label: "中文", labelEn: "Chinese" },
];

export function PartyList() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const characterName = useCharacterName();
  const [langFilter, setLangFilter] = useState<string>("");
  const [charFilter, setCharFilter] = useState<Set<number>>(new Set());

  const url = langFilter
    ? `/api/parties?language=${langFilter}`
    : "/api/parties";

  const { data, loading, error } = useFetch<{ parties: PartyRow[] }>(url);

  const allParties = data?.parties ?? [];
  const parties = allParties.filter((party) => {
    if (charFilter.size > 0) {
      const claimed = parseJsonArray<number>(party.claimedCharacterIds);
      const hasOpenMatch = [...charFilter].some((id) => !claimed.includes(id));
      if (!hasOpenMatch) return false;
    }
    return true;
  });

  const toggleCharFilter = (id: number) => {
    setCharFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyProfilePreferences = () => {
    if (!user) return;
    if (charFilter.size > 0 && [...charFilter].every((id) => user.characterPreferences.includes(id)) && charFilter.size === user.characterPreferences.length) {
      setCharFilter(new Set());
    } else {
      setCharFilter(new Set(user.characterPreferences));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("nav.parties")}</h1>
        <div className="flex gap-1">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              onClick={() => setLangFilter(opt.code)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                langFilter === opt.code
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {i18n.language === "en" ? opt.labelEn : opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {CHARACTERS.map((char) => (
          <button
            key={char.id}
            onClick={() => toggleCharFilter(char.id)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              charFilter.has(char.id)
                ? "text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            style={charFilter.has(char.id) ? { backgroundColor: char.color } : undefined}
          >
            {characterName(char.id)}
          </button>
        ))}
        {user && user.characterPreferences.length > 0 && (
          <button
            onClick={applyProfilePreferences}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              charFilter.size > 0 && [...charFilter].every((id) => user.characterPreferences.includes(id)) && charFilter.size === user.characterPreferences.length
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t("myParties.fromProfile")}
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-4">
          {error}
        </div>
      )}

      {!loading && parties.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t("partyList.empty")}</p>
          <Link
            to="/"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            {t("home.createParty")}
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {parties.map((party) => {
          const languages: string[] = (() => {
            try {
              return JSON.parse(party.languages);
            } catch {
              return [];
            }
          })();
          const openSlots = 12 - (party.claimedCount ?? 0);

          return (
            <Link
              key={party.id}
              to={`/parties/${party.id}`}
              className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{party.name}</h2>
                  <div className="flex gap-2 mt-1">
                    {languages.map((lang: string) => (
                      <span
                        key={lang}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {lang === "ja" ? "日本語" : lang === "en" ? "English" : lang === "zh" ? "中文" : lang}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                  <div>{t("partyList.members", { count: party.memberCount })}</div>
                  <div className={openSlots > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400"}>
                    {t("partyList.openSlots", { count: openSlots })}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
