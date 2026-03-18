import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useCharacterName } from "../hooks/useCharacterName";
import { putApi } from "../hooks/useApi";
import { CHARACTERS } from "../shared/characters";

export function Profile() {
  const { t } = useTranslation();
  const { user, loading, authError, authSlow, login, logout, refresh } = useAuth();
  const charName = useCharacterName();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        <p className="mt-3 text-sm">{t("common.loading")}</p>
        {authSlow && (
          <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
            {t("profile.authSlow")}
          </p>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">{t("profile.title")}</h1>
        {authError && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg p-3 text-sm mb-4 max-w-md mx-auto">
            {authError}
          </div>
        )}
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

  const prefs = user.characterPreferences ?? [];

  async function addPreference(characterId: number) {
    const updated = [...prefs, characterId];
    await savePreferences(updated);
  }

  async function removePreference(characterId: number) {
    const updated = prefs.filter((id) => id !== characterId);
    await savePreferences(updated);
  }

  async function movePreference(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= prefs.length) return;
    const updated = [...prefs];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    await savePreferences(updated);
  }

  async function savePreferences(updated: number[]) {
    setSaving(true);
    setSaveError(null);
    try {
      await putApi("/api/profile", { characterPreferences: updated });
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const unselected = CHARACTERS.filter((c) => !prefs.includes(c.id));

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

      {/* Character Preferences */}
      <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="font-semibold text-lg mb-1">{t("profile.characterPreferences")}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t("profile.characterPreferencesHint")}</p>

        {saveError && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-2 text-sm mb-3">
            {saveError}
          </div>
        )}

        {/* Selected preferences (ordered) */}
        {prefs.length > 0 && (
          <div className="space-y-2 mb-4">
            {prefs.map((charId, index) => {
              const char = CHARACTERS.find((c) => c.id === charId);
              if (!char) return null;
              return (
                <div
                  key={charId}
                  className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <span className="text-xs font-bold text-gray-400 w-5 text-right">#{index + 1}</span>
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: char.color }}
                  >
                    {char.id}
                  </span>
                  <span className="flex-1 text-sm font-medium">{charName(charId)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePreference(index, -1)}
                      disabled={saving || index === 0}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                    >
                      &uarr;
                    </button>
                    <button
                      onClick={() => movePreference(index, 1)}
                      disabled={saving || index === prefs.length - 1}
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                    >
                      &darr;
                    </button>
                    <button
                      onClick={() => removePreference(charId)}
                      disabled={saving}
                      className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-30"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Unselected characters to add */}
        {unselected.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">{t("profile.addCharacter")}</div>
            <div className="flex flex-wrap gap-2">
              {unselected.map((char) => (
                <button
                  key={char.id}
                  onClick={() => addPreference(char.id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  <span
                    className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: char.color }}
                  >
                    {char.id}
                  </span>
                  {charName(char.id)}
                </button>
              ))}
            </div>
          </div>
        )}

        {prefs.length === 0 && unselected.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">{t("profile.noPreferencesYet")}</p>
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
