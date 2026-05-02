// Реестр банков Республики Казахстан (БИК → название).
// Источник: список БВУ Национального Банка РК (актуально на 2026 год).
// Если банка нет в списке, БИК не будет подсвечен — введите название вручную.

export type KzBank = {
  bik: string       // 8-значный БИК (SWIFT-формат)
  name: string      // Полное юридическое название
  short: string     // Краткое название для UI
}

export const KZ_BANKS: KzBank[] = [
  { bik: "HSBKKZKX", name: "АО «Народный Банк Казахстана» (Halyk Bank)", short: "Halyk Bank" },
  { bik: "KCJBKZKX", name: "АО «Kaspi Bank»", short: "Kaspi Bank" },
  { bik: "TSESKZKA", name: "АО «First Heartland Jusan Bank»", short: "Jusan Bank" },
  { bik: "BRKEKZKA", name: "АО «Bereke Bank»", short: "Bereke Bank" },
  { bik: "ATFBKZKA", name: "АО «Bank Freedom Finance Kazakhstan»", short: "Freedom Finance" },
  { bik: "EURIKZKA", name: "АО «Евразийский банк»", short: "Eurasian Bank" },
  { bik: "BTSBKZKA", name: "АО «БТА Банк»", short: "BTA Bank" },
  { bik: "CASPKZKA", name: "АО «Caspian Bank»", short: "Caspian Bank" },
  { bik: "ALFAKZKA", name: "АО ДБ «Альфа-Банк»", short: "Alfa-Bank" },
  { bik: "NBPAKZKA", name: "АО ДБ «Национальный Банк Пакистана»", short: "NBP" },
  { bik: "INLMKZKA", name: "АО «AsiaCredit Bank»", short: "AsiaCredit" },
  { bik: "VTBAKZKZ", name: "АО ДБ «Банк ВТБ (Казахстан)»", short: "ВТБ Казахстан" },
  { bik: "SABRKZKA", name: "АО ДБ «Сбербанк России»", short: "Сбербанк" },
  { bik: "KZIBKZKA", name: "АО «Заман-Банк»", short: "Zaman-Bank" },
  { bik: "NURSKZKX", name: "АО «Nurbank»", short: "Nurbank" },
  { bik: "DBKAKZKX", name: "АО «Банк Развития Казахстана»", short: "БРК" },
  { bik: "HCBKKZKX", name: "АО «Хоум Кредит Банк»", short: "Home Credit" },
  { bik: "ICBKKZKX", name: "АО «Industrial and Commercial Bank of China (Almaty)»", short: "ICBC Almaty" },
  { bik: "KZKOKZKX", name: "АО «Казкоммерцбанк»", short: "Казком" },
  { bik: "CITIKZKA", name: "АО «Ситибанк Казахстан»", short: "Citibank KZ" },
  { bik: "BKCHKZKA", name: "АО «Банк Китая в Казахстане»", short: "Bank of China" },
  { bik: "ALMNKZKA", name: "АО «AltynBank»", short: "AltynBank" },
  { bik: "DSKHKZKA", name: "АО «КЗИ Банк»", short: "КЗИ Банк" },
  { bik: "TXBNKZKA", name: "АО «TexakaBank»", short: "TexakaBank" },
  { bik: "SHBKKZKA", name: "АО «Шинхан Банк Казахстан»", short: "Shinhan Bank" },
  { bik: "RBKAKZKX", name: "АО «Bank RBK»", short: "Bank RBK" },
  { bik: "FFINKZA1", name: "АО «Freedom Finance Bank»", short: "Freedom Finance" },
  // Forte Bank — ранее ATFBank, BIK мог поменяться, оставляем оба
  { bik: "IRTYKZKA", name: "АО «ForteBank»", short: "ForteBank" },
]

// Карта для O(1) поиска
const BIK_INDEX = new Map(KZ_BANKS.map((b) => [b.bik.toUpperCase(), b]))

/** Найти банк по БИК. Возвращает null если не найден. */
export function findBankByBik(bik: string): KzBank | null {
  if (!bik) return null
  return BIK_INDEX.get(bik.trim().toUpperCase()) ?? null
}

/** Грубая проверка формата БИК: 8 алфанумерических символов в верхнем регистре. */
export function isValidBikFormat(bik: string): boolean {
  return /^[A-Z0-9]{8}$/.test(bik.trim().toUpperCase())
}
