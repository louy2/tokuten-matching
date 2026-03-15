import { useParams } from "react-router";
import { useTranslation } from "react-i18next";

export function PartyDetail() {
  const { partyId } = useParams();
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {t("party.detail")} — {partyId}
      </h1>
      <p className="text-gray-500">{t("common.comingSoon")}</p>
    </div>
  );
}
