// Иконка категории на плане берётся из Tenant.category — а это свободный текст
// («розничная торговля», «кафе», «офис»), который заводит администратор.
// Поэтому классифицируем по ключевым словам, а не заводим ещё один справочник:
// новая колонка в БД заставила бы переразмечать всех действующих арендаторов.

import type { TenantCategory } from "./tokens"

const RULES: Array<{ category: TenantCategory; words: string[] }> = [
  {
    category: "food",
    words: [
      "кафе", "ресторан", "столов", "пицц", "суши", "бургер", "фастфуд", "кофе", "кондитер",
      "пекарн", "выпечк", "шаурм", "бар", "食", "food", "coffee", "cafe", "pizza",
    ],
  },
  {
    category: "beauty",
    words: [
      "красот", "парикмахер", "барбер", "маникюр", "ногт", "космет", "визаж", "спа", "spa",
      "бров", "ресниц", "тату", "солярий", "beauty", "nail",
    ],
  },
  {
    category: "health",
    words: [
      "аптек", "клиник", "медиц", "стоматолог", "зубн", "лаборатор", "оптик", "массаж",
      "health", "pharm", "dental", "очк",
    ],
  },
  {
    category: "kids",
    words: ["детск", "игруш", "школ", "развива", "малыш", "kids", "baby", "child"],
  },
  {
    category: "electronics",
    words: [
      "техник", "электрон", "телефон", "гаджет", "компьютер", "ноутбук", "смартфон",
      "mobile", "digital", "electro", "сервисный центр",
    ],
  },
  {
    category: "bank",
    words: [
      "банк", "обмен", "валют", "микрофинанс", "страхов", "ломбард", "kaspi", "каспи",
      "финанс", "bank", "insurance",
    ],
  },
  {
    category: "services",
    words: [
      "услуг", "ремонт", "ателье", "химчистк", "типограф", "сервис", "мастерск", "нотариус",
      "юрист", "юридич", "турагент", "туристич", "фотограф", "курьер", "прачечн", "пошив",
      "service", "repair",
    ],
  },
  {
    category: "retail",
    words: [
      "магазин", "торговл", "одежд", "обув", "бутик", "ритейл", "продукт", "товар",
      "супермаркет", "минимаркет", "ювелир", "парфюм", "цвет", "книг", "спорттовар",
      "shop", "store", "retail", "market", "fashion",
    ],
  },
  {
    category: "office",
    words: ["офис", "коворкинг", "агентств", "бюро", "представительств", "office", "coworking"],
  },
]

/**
 * Свободный текст вида деятельности → категория для иконки.
 * Если ничего не совпало, но текст есть — «прочее»; если текста нет — null,
 * и тогда на плане иконки просто не будет.
 */
export function classifyCategory(...sources: Array<string | null | undefined>): TenantCategory | null {
  const text = sources
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()
  if (!text) return null

  for (const rule of RULES) {
    if (rule.words.some((word) => text.includes(word))) return rule.category
  }
  return "other"
}
