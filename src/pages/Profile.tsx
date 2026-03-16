import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export function Profile() {
  const { t } = useTranslation();
  const { user, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">{t("profile.title")}</h1>
        <p className="text-gray-500 mb-6">{t("profile.loginRequired")}</p>
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
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("profile.title")}</h1>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-400">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-lg">{user.displayName}</div>
            <div className="text-sm text-gray-500">{t("profile.userId")}: {user.id.slice(0, 8)}...</div>
          </div>
        </div>

        {/* Avatar URL */}
        {user.avatarUrl && (
          <div>
            <div className="text-xs text-gray-500 mb-1">{t("profile.avatar")}</div>
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-16 h-16 rounded-full"
            />
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="mt-6 w-full py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm"
      >
        {t("profile.logout")}
      </button>
    </div>
  );
}
