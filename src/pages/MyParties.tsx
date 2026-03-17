import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useFetch } from "../hooks/useApi";
import { useCharacterName } from "../hooks/useCharacterName";
import { CHARACTERS } from "../shared/characters";
import type { Language } from "../shared/types";

const LANGUAGE_OPTIONS: { code: Language | ""; label: string; labelEn: string }[] = [
  { code: "", label: "すべて", labelEn: "All" },
  { code: "ja", label: "日本語", labelEn: "Japanese" },
  { code: "en", label: "English", labelEn: "English" },
  { code: "zh", label: "中文", labelEn: "Chinese" },
];

interface MyPartyRow {
  id: string;
  name: string;
  status: string;
  languages: string;
  leaderId: string;
  memberCount: number;
  claimedCount: number;
  claimedCharacterIds: string | null;
}

function parseJsonArray<T>(json: string | null): T[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

export function MyParties() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading, login } = useAuth();
  const characterName = useCharacterName();
  const [langFilter, setLangFilter] = useState<string>("");
  const [charFilter, setCharFilter] = useState<Set<number>>(new Set());
  const { data, loading } = useFetch<{ parties: MyPartyRow[] }>(
    user ? "/api/my-parties" : null,
  );

  const allParties = data?.parties ?? [];
  const parties = allParties.filter((party) => {
    if (langFilter) {
      const languages = parseJsonArray<string>(party.languages);
      if (!languages.includes(langFilter)) return false;
    }
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

  if (authLoading || loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">{t("nav.myParties")}</h1>
        <p className="text-gray-500 mb-6">{t("myParties.loginRequired")}</p>
        <button
          onClick={login}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t("common.login")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("nav.myParties")}</h1>
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

      {parties.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t("myParties.empty")}</p>
          <Link
            to="/parties"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            {t("home.findParty")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {parties.map((party) => {
            const languages: string[] = (() => {
              try { return JSON.parse(party.languages); } catch { return []; }
            })();
            const isLeader = party.leaderId === user.id;

            return (
              <Link
                key={party.id}
                to={`/parties/${party.id}`}
                className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{party.name}</h2>
                      {isLeader && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
                          {t("partyDetail.leader")}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        party.status === "open"
                          ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      }`}>
                        {party.status === "open" ? t("partyDetail.statusOpen") : t("partyDetail.statusLocked")}
                      </span>
                    </div>
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
                  <div className="text-right text-sm text-gray-500">
                    <div>{party.memberCount} {t("partyDetail.members")}</div>
                    <div>{party.claimedCount}/12 {t("partyDetail.claimed")}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
