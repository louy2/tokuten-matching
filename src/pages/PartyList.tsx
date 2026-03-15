import { useTranslation } from "react-i18next";

export function PartyList() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t("nav.parties")}</h1>
      <p className="text-gray-500">{t("common.comingSoon")}</p>
    </div>
  );
}
