export interface Character {
  id: number;
  nameJa: string;
  nameEn: string;
  nameZh: string;
}

export const CHARACTERS: Character[] = [
  { id: 1, nameJa: "上原歩夢", nameEn: "Ayumu Uehara", nameZh: "上原步梦" },
  { id: 2, nameJa: "中須かすみ", nameEn: "Kasumi Nakasu", nameZh: "中须霞" },
  { id: 3, nameJa: "桜坂しずく", nameEn: "Shizuku Osaka", nameZh: "樱坂雫" },
  { id: 4, nameJa: "朝香果林", nameEn: "Karin Asaka", nameZh: "朝香果林" },
  { id: 5, nameJa: "宮下愛", nameEn: "Ai Miyashita", nameZh: "宫下爱" },
  { id: 6, nameJa: "近江彼方", nameEn: "Kanata Konoe", nameZh: "近江彼方" },
  { id: 7, nameJa: "優木せつ菜", nameEn: "Setsuna Yuki", nameZh: "优木雪菜" },
  { id: 8, nameJa: "エマ・ヴェルデ", nameEn: "Emma Verde", nameZh: "爱玛·薇尔德" },
  { id: 9, nameJa: "天王寺璃奈", nameEn: "Rina Tennoji", nameZh: "天王寺璃奈" },
  { id: 10, nameJa: "三船栞子", nameEn: "Shioriko Mifune", nameZh: "三船栞子" },
  { id: 11, nameJa: "ミア・テイラー", nameEn: "Mia Taylor", nameZh: "米娅·泰勒" },
  { id: 12, nameJa: "鐘嵐珠", nameEn: "Lanzhu Zhong", nameZh: "钟岚珠" },
];

export const SET_PRICE_YEN = 21_600;
