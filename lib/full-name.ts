/**
 * Хелпер для построения «полного имени» лица для документов.
 *
 * Логика РК:
 *   ИП  → «ИП ФИО» (бизнес ведёт физлицо под своим именем)
 *   ТОО → «ТОО Название»
 *   АО  → «АО Название»
 *   ЧСИ → «ЧСИ ФИО» (Частный судебный исполнитель — тоже персональный)
 *   FIZ/PHYSICAL → просто «ФИО» без префикса
 *
 * Защита от дублирования: если в companyName/directorName/fullName уже есть
 * префикс формы собственности («ТОО Кармен», «ИП Иванов», «АО Halyk»), —
 * не добавляем второй раз. То есть «ТОО ТОО Кармен» получиться не должно.
 */

// Паттерны префиксов, которые НЕ надо дублировать. Регистронезависимо, с любыми
// кавычками и пробелами. Также ловит латинские «ТОО»/«TOO».
const PREFIX_PATTERNS: Array<{ test: RegExp; legalType: string }> = [
  // ИП — обязательно отдельным словом (чтобы не цеплять «Иполит»)
  { test: /^\s*ИП\s+/i,  legalType: "IP" },
  // ЧСИ или полное «Частный судебный исполнитель»
  { test: /^\s*(?:ЧСИ|Частный\s+судебный\s+исполнитель)\s+/i, legalType: "CHSI" },
  // ТОО (и латинский TOO)
  { test: /^\s*(?:ТОО|TOO)\s+/i, legalType: "TOO" },
  // АО (и латинский AO/JSC)
  { test: /^\s*(?:АО|AO|JSC)\s+/i, legalType: "AO" },
]

/**
 * Возвращает true если строка уже начинается с любого префикса формы.
 * Используется для решения «добавлять префикс или нет».
 */
export function hasLegalPrefix(value: string | null | undefined): boolean {
  if (!value) return false
  return PREFIX_PATTERNS.some((p) => p.test.test(value))
}

/**
 * Если уже есть префикс — возвращает строку как есть. Иначе — добавляет.
 */
function addPrefixIfMissing(prefix: string, value: string): string {
  return hasLegalPrefix(value) ? value : `${prefix} ${value}`
}

export function buildLegalEntityFullName(input: {
  legalType: string | null | undefined
  companyName?: string | null
  directorName?: string | null
  fullName?: string | null
}): string {
  const legalType = (input.legalType ?? "").toUpperCase()
  const company = (input.companyName ?? "").trim()
  const director = (input.directorName ?? "").trim()
  const explicit = (input.fullName ?? "").trim()

  // Если уже задано fullName (например LEGAL_ENTITY.fullName) — берём как есть,
  // но всё равно прогоняем через защиту от дубля префикса (на случай если
  // кто-то записал «ТОО ТОО Turanix»).
  if (explicit) return explicit

  switch (legalType) {
    case "IP":
      // Для ИП основная единица — ФИО владельца.
      if (director) return addPrefixIfMissing("ИП", director)
      if (company)  return addPrefixIfMissing("ИП", company)
      return "ИП"
    case "CHSI":
      if (director) return addPrefixIfMissing("ЧСИ", director)
      if (company)  return addPrefixIfMissing("ЧСИ", company)
      return "ЧСИ"
    case "TOO":
      if (company)  return addPrefixIfMissing("ТОО", company)
      if (director) return addPrefixIfMissing("ТОО", director)
      return "ТОО"
    case "AO":
      if (company)  return addPrefixIfMissing("АО", company)
      if (director) return addPrefixIfMissing("АО", director)
      return "АО"
    case "FIZ":
    case "PHYSICAL":
    case "INDIVIDUAL":
      // Физлицо — без префикса.
      return director || company
    default:
      // Неизвестный legalType — возвращаем что есть, без принудительного префикса.
      return company || director
  }
}
