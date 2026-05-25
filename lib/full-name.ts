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
 *   ИП/ЧСИ/Физлицо — НЕ используется «в лице», поскольку юр. лицо отсутствует —
 *     это сам человек: «ИП Иванов И.И., именуемый в дальнейшем «Арендатор»,
 *     действующий на основании Уведомления о государственной регистрации».
 *
 *   ТОО/АО — используется «в лице директора Иванова И.И., действующего на
 *     основании Устава» (с склонением фамилии директора в родительный падеж).
 *
 * Параметры:
 *   - legalType                  — IP / CHSI / TOO / AO / PHYSICAL
 *   - fullName                   — уже отформатированное «ТОО Кармен» / «ИП Иванов И.И.»
 *   - directorName               — ФИО подписанта (только для ТОО/АО)
 *   - directorPosition           — «директор», «генеральный директор», «управляющий» (для ТОО/АО)
 *   - basisText                  — «Устава», «Уведомления о государственной регистрации № X от Y»
 *   - calledAs                   — «Арендодатель» / «Арендатор» (для роли в договоре)
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
}): string {
  const legalType = (input.legalType ?? "").toUpperCase()
  const usesDirector = legalType === "TOO" || legalType === "AO"
  // «именуемое» для ТОО/АО (среднее), «именуемый» для ИП/ЧСИ/Физлица (мужское).
  // Юридически принято писать «именуемый(ое) в дальнейшем» — оставим
  // правильное согласование.
  const namedAs = usesDirector ? "именуемое" : "именуемый"
  const actingAs = usesDirector ? "действующего" : "действующий"

  if (usesDirector && input.directorName) {
    const position = (input.directorPosition || "директора").trim()
    // Должность тоже склоняется (директора, генерального директора).
    // Простой подход: добавляем «-а» через declineFio (он умеет согласные).
    const positionGenitive = declineFio(position, "genitive")
    // ФИО директора — сокращаем до «Фамилия И.О.» и склоняем фамилию.
    const directorShort = shortenFioGenitive(input.directorName)
    return `${input.fullName}, ${namedAs} в дальнейшем «${input.calledAs}», в лице ${positionGenitive} ${directorShort}, ${actingAs} на основании ${input.basisText}`
  }

  // ИП / ЧСИ / Физлицо — без «в лице».
  return `${input.fullName}, ${namedAs} в дальнейшем «${input.calledAs}», ${actingAs} на основании ${input.basisText}`
}
