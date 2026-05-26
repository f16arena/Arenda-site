import { declineFio, shortenFioGenitive } from "@/lib/declension"

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

/**
 * Возвращает фрагмент «именуем(ое/ый) в дальнейшем «X», в лице Y, действующего
 * на основании Z», правильно учитывая правовую форму:
 *
 *   ИП/ЧСИ/Физлицо — «в лице (ФИО полностью в род. падеже)». Юридически
 *     ИП — это физлицо, ведущее бизнес, и фразой «в лице» подчёркивается
 *     подписант. По умолчанию `useInLitseForSole=true` (см. ответ владельца
 *     в #2 аудит 2026-05-26: «да всегда для всех»).
 *
 *   ТОО/АО — «в лице директора Иванова И.И., действующего на основании Устава»
 *     (с короткой формой ФИО и склонением фамилии).
 *
 * Параметры:
 *   - legalType                  — IP / CHSI / TOO / AO / PHYSICAL
 *   - fullName                   — уже отформатированное «ТОО Кармен» / «ИП Иванов И.И.»
 *   - directorName               — ФИО подписанта (для ТОО/АО — директор; для
 *                                  ИП/ЧСИ — сам ИП/судисп.)
 *   - directorPosition           — «директор», «генеральный директор», «управляющий» (для ТОО/АО)
 *   - basisText                  — «Устава», «Уведомления о государственной регистрации № X от Y»
 *   - calledAs                   — «Арендодатель» / «Арендатор» (для роли в договоре)
 *   - useInLitseForSole          — добавлять ли «в лице (ФИО)» для ИП/ЧСИ. По
 *                                  умолчанию true.
 *
 * Возвращает готовую строку без точки в конце (потом окружают запятыми).
 */
export function buildSignerIntro(input: {
  legalType: string | null | undefined
  fullName: string
  directorName?: string | null
  directorPosition?: string | null
  basisText: string
  calledAs: "Арендодатель" | "Арендатор"
  useInLitseForSole?: boolean
}): string {
  const legalType = (input.legalType ?? "").toUpperCase()
  const isSoleProprietor = legalType === "IP" || legalType === "CHSI"
  const usesDirector = legalType === "TOO" || legalType === "AO"
  // «именуемое» для ТОО/АО (среднее), «именуемый» для ИП/ЧСИ/Физлица (мужское).
  const namedAs = usesDirector ? "именуемое" : "именуемый"
  const actingAs = usesDirector ? "действующего" : "действующий"

  if (usesDirector && input.directorName) {
    const position = (input.directorPosition || "директора").trim()
    // Должность склоняется (директора, генерального директора).
    const positionGenitive = declineFio(position, "genitive")
    // ФИО директора — короткая форма «Фамилия И.О.» в род. падеже.
    const directorShort = shortenFioGenitive(input.directorName)
    return `${input.fullName}, ${namedAs} в дальнейшем «${input.calledAs}», в лице ${positionGenitive} ${directorShort}, ${actingAs} на основании ${input.basisText}`
  }

  // Для ИП/ЧСИ добавляем «в лице (ФИО в род. падеже)» — по требованию
  // владельца. Это ПОЛНОЕ склонённое ФИО (а не сокращённое), потому что
  // юридически это сам подписант — нужна полная идентификация.
  // declineFio() сам разбивает по пробелам и склоняет каждую часть.
  const useInLitse = input.useInLitseForSole ?? true
  if (useInLitse && isSoleProprietor && input.directorName) {
    const fioGenitive = declineFio(input.directorName, "genitive")
    return `${input.fullName}, ${namedAs} в дальнейшем «${input.calledAs}», в лице ${fioGenitive}, ${actingAs} на основании ${input.basisText}`
  }

  // Физлицо без directorName — без «в лице».
  return `${input.fullName}, ${namedAs} в дальнейшем «${input.calledAs}», ${actingAs} на основании ${input.basisText}`
}
