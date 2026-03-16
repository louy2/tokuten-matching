import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useFetch } from "../hooks/useApi";

interface MyPartyRow {
  id: string;
  name: string;
  status: string;
  languages: string;
  leader_id: string;
  member_count: number;
  claimed_count: number;
}

export function MyParties() {
  const { t } = useTranslation();
  const { user, loading: authLoading, login } = useAuth();
  const { data, loading } = useFetch<{ parties: MyPartyRow[] }>(
    user ? "/api/my-parties" : null,
  );

  const parties = data?.parties ?? [];

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
      <h1 className="text-2xl font-bold mb-6">{t("nav.myParties")}</h1>

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
            const isLeader = party.leader_id === user.id;

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
                    <div>{party.member_count} {t("partyDetail.members")}</div>
                    <div>{party.claimed_count}/12 {t("partyDetail.claimed")}</div>
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
