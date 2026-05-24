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
 * Возвращает строку, готовую для вставки в шаблон договора, чтобы
 * не пришлось хардкодить «ИП» / «ТОО» / «ЧСИ» в самом тексте.
 */
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

  // Если уже задано fullName (например в LEGAL_ENTITY.fullName) — берём как есть.
  if (explicit) return explicit

  switch (legalType) {
    case "IP":
      // Для ИП основная единица — ФИО владельца.
      return director ? `ИП ${director}` : (company ? `ИП ${company}` : "ИП")
    case "CHSI":
      return director ? `ЧСИ ${director}` : (company ? `ЧСИ ${company}` : "ЧСИ")
    case "TOO":
      return company ? `ТОО ${company}` : (director ? `ТОО ${director}` : "ТОО")
    case "AO":
      return company ? `АО ${company}` : (director ? `АО ${director}` : "АО")
    case "FIZ":
    case "PHYSICAL":
    case "INDIVIDUAL":
      return director || company
    default:
      // Неизвестный legalType — возвращаем что есть, без префикса.
      return company || director
  }
}
