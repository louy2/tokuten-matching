import { useTranslation } from "react-i18next";
import { CHARACTERS } from "../shared/characters";

export function useCharacterName() {
  const { i18n } = useTranslation();

  return (characterId: number): string => {
    const char = CHARACTERS.find((c) => c.id === characterId);
    if (!char) return `#${characterId}`;
    const lang = i18n.language;
    if (lang === "en") return char.nameEn;
    if (lang === "zh") return char.nameZh;
    return char.nameJa;
  };
}
