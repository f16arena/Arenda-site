// Реквизиты юридического лица — оператора SaaS-сервиса Commrent.
// Заполнить после регистрации ТОО. До этого момента поля содержат placeholder'ы.
// Все юридические страницы (/offer, /privacy, /terms, /sla) импортируют отсюда —
// одно изменение здесь обновит реквизиты во всех документах.

const PLACEHOLDER = "________________"

export const LEGAL_ENTITY = {
  // Полное наименование с организационно-правовой формой
  fullName: `ТОО «Commrent»`,
  // Краткое имя бренда — используется в текстах
  brand: "Commrent",
  // БИН (12 цифр)
  bin: PLACEHOLDER,
  // Юридический адрес
  legalAddress: PLACEHOLDER,
  // Фактический адрес
  actualAddress: PLACEHOLDER,
  // Город заключения договора
  city: PLACEHOLDER,
  // Банк и реквизиты
  bankName: PLACEHOLDER,
  iik: PLACEHOLDER,
  bik: PLACEHOLDER,
  kbe: "____",
  // Директор
  directorName: PLACEHOLDER,
  // Телефон
  phone: "+7 (___) ___-__-__",
  // Email-адреса
  email: {
    support: "support@commrent.kz",
    privacy: "privacy@commrent.kz",
    security: "security@commrent.kz",
    incident: "incident@commrent.kz",
  },
  // Дата публикации/последнего обновления документов
  effectiveDate: PLACEHOLDER,
  lastUpdated: PLACEHOLDER,
  // Сайт
  site: "https://commrent.kz",
} as const

// CSS-класс для подсвеченных placeholder'ов в юр. документах,
// чтобы быстро найти, что осталось заполнить.
export const PLACEHOLDER_CLASS =
  "inline-block min-w-[6ch] px-1 bg-amber-50 text-amber-900 border-b border-amber-300 font-mono text-[0.92em]"

// Хелпер: оборачивает значение в <span> с подсветкой, если оно равно PLACEHOLDER
export function isPlaceholder(value: string): boolean {
  return value === PLACEHOLDER || value.includes("___")
}
