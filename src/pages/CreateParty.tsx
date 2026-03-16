import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { postApi } from "../hooks/useApi";
import type { Language } from "../shared/types";

const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export function CreateParty() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupChatLink, setGroupChatLink] = useState("");
  const [languages, setLanguages] = useState<Language[]>(["ja"]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">{t("createParty.title")}</h1>
        <p className="text-gray-500 mb-6">{t("createParty.loginRequired")}</p>
        <button
          onClick={login}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t("common.login")}
        </button>
      </div>
    );
  }

  function toggleLanguage(lang: Language) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (languages.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await postApi<{ partyId: string }>("/api/parties/create", {
        name: name.trim(),
        description: description.trim() || undefined,
        groupChatLink: groupChatLink.trim() || undefined,
        languages,
      });
      navigate(`/parties/${result.partyId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create party");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("createParty.title")}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Party Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("createParty.name")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createParty.namePlaceholder")}
            maxLength={60}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("createParty.description")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("createParty.descriptionPlaceholder")}
            rows={3}
            maxLength={300}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </div>

        {/* Languages */}
        <div>
          <label className="block text-sm font-medium mb-2">
            {t("createParty.languages")} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => toggleLanguage(opt.code)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  languages.includes(opt.code)
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Group Chat Link */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("createParty.groupChatLink")}
          </label>
          <input
            type="url"
            value={groupChatLink}
            onChange={(e) => setGroupChatLink(e.target.value)}
            placeholder="https://discord.gg/... or https://line.me/..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">{t("createParty.groupChatHint")}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !name.trim() || languages.length === 0}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {submitting ? t("common.loading") : t("createParty.submit")}
        </button>
      </form>
    </div>
  );
}
