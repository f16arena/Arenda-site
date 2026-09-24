import ExcelJS from "exceljs"
// Только тип: import type стирается при сборке, server-only сюда не попадает.
import type { getT } from "@/lib/i18n/server"

/**
 * Утилиты для парсинга Excel-файлов и нормализации значений.
 *
 * Поддерживаются форматы:
 *  - .xlsx (основной)
 *  - .csv (через ExcelJS read csv)
 */

/** Переводчик передаётся параметром: чистая функция сессию не читает. */
type Tr = Awaited<ReturnType<typeof getT>>["t"]

export interface SheetData {
  headers: string[]
  rows: string[][]
}

/**
 * Читает первый лист Excel-файла как массив массивов строк.
 * Пустые строки и колонки (полностью без данных) пропускаются.
 */
export async function parseExcel(buffer: Buffer | ArrayBuffer, t?: Tr): Promise<SheetData> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS типы конфликтуют с Node Buffer<ArrayBufferLike> — приводим через unknown
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error(t ? t("adminDocs.api.excelImport.emptyFile") : "Файл пуст или повреждён")

  const rows: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value))
    })
    rows.push(cells)
  })

  if (rows.length === 0) throw new Error(t ? t("adminDocs.api.excelImport.emptySheet") : "Лист пустой")

  const [headers, ...data] = rows
  return {
    headers: headers.map((h) => h.trim()),
    rows: data,
  }
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText.map((r: { text: string }) => r.text).join("").trim()
  }
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim()
  if (typeof v === "object" && "result" in v) return cellToString((v as { result: ExcelJS.CellValue }).result)
  return String(v).trim()
}

/**
 * Казахские заголовки колонок — по имени поля, а не по вызывающему коду.
 *
 * Шаблон импорта (app/api/import/tenants/template) отдаётся на языке
 * пользователя, и казахская шапка обязана сопоставиться с теми же полями.
 * Словари синонимов лежат в app/actions/import-*.ts (русские варианты);
 * казахские держим здесь, рядом с парсером, чтобы шаблон и разбор не
 * разъезжались. Регистр и знаки препинания не важны — сравнение идёт по
 * «раздетой» строке (см. ниже).
 */
const KK_FIELD_SYNONYMS: Record<string, string[]> = {
  contactName: ["Байланыс тұлғасы", "Аты-жөні", "Аты жөні", "Т.А.Ә.", "ТАӘ", "Байланыс"],
  phone: ["Телефон", "Байланыс телефоны", "Ұялы телефон", "Ұялы"],
  email: ["Email", "Электрондық пошта", "Э-пошта", "Пошта"],
  companyName: ["Компания атауы", "Ұйым атауы", "Компания", "Атауы", "Ұйым", "Мекеме", "Жалға алушы", "Контрагент"],
  legalType: ["Ұйым түрі", "Құқықтық нысаны", "Нысаны", "Түрі"],
  bin: ["БСН", "ЖСН", "БСН/ЖСН", "ЖСН/БСН", "БСНЖСН", "ЖСНБСН"],
  category: ["Санаты", "Қызмет түрі", "Қызмет саласы", "Сала"],
  spaceNumber: ["Үй-жай", "Үй жай", "Үй-жай нөмірі", "Үй-жай №", "Кеңсе", "Кабинет", "Офис"],
  area: ["Аудан", "Ауданы", "м2", "м²"],
  rate: ["Мөлшерлеме", "Мөлшерлемесі", "Тариф", "Мөлшерлеме ₸/м²", "1 м² бағасы"],
  fixedMonthlyRent: ["Тұрақты жалдау ақысы", "Тіркелген жалдау ақысы", "Жалдау ақысы ₸/ай", "Айлық жалдау ақысы", "Жалдау ақысы"],
  contractStart: ["Басталу күні", "Басталған күні", "Басталуы"],
  contractEnd: ["Аяқталу күні", "Аяқталған күні", "Аяқталуы", "Бітуі"],
  cleaningFee: ["Тазалау ақысы", "Тазалау", "Клининг"],
  needsCleaning: ["Тазалау қажет"],
  legalAddress: ["Заңды мекенжайы", "Заңды мекенжай"],
  directorName: ["Бас директор", "Директор", "Басшы", "Жетекші"],
  // Реестры начислений и договоров (app/actions/import-charges, import-contracts).
  tenant: ["Жалға алушы", "Компания", "Контрагент", "Ұйым", "Мекеме", "Атауы"],
  period: ["Кезең", "Кезеңі", "Айы", "Ай"],
  type: ["Түрі", "Қызмет", "Қызмет түрі", "Мақсаты", "Тағайындалуы"],
  amount: ["Сома", "Сомасы", "Есептелген", "Есептелді", "Төленетін сома", "Төлеуге", "Сома ₸"],
  isPaid: ["Төленген", "Төленді", "Мәртебесі", "Төлем"],
  dueDate: ["Төлем мерзімі", "Төлеу мерзімі", "Дейін төлеу", "Мерзімі"],
  description: ["Сипаттамасы", "Сипаттама", "Ескертпе", "Түсініктеме"],
  number: ["Шарт нөмірі", "Шарт №", "Нөмірі", "Нөмір"],
  startDate: ["Басталу күні", "Шарт күні", "Күні"],
  endDate: ["Аяқталу күні", "Қолданылу мерзімі", "Дейін жарамды"],
  status: ["Мәртебесі", "Мәртебе", "Күйі"],
}

/**
 * «Раздетый» заголовок: регистр, пробелы, точки и скобки не важны.
 *
 * Все казахские буквы обязаны попасть в разрешённый набор: диапазон а-я их не
 * включает (ә, і, ү, ұ, қ, ғ, ң, ө, һ лежат вне него), и пропущенная буква
 * молча выпадала бы из заголовка — «Заңды» превращалось в «зады». Ё сводим к Е:
 * в одних выгрузках пишут «учёт», в других «учет».
 */
function stripHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-яәіүұқғңөһ0-9]/g, "")
}

/**
 * Auto-mapping колонок Excel на поля схемы.
 * Принимает массив заголовков и словарь синонимов, возвращает индексы.
 * К переданным синонимам добавляются казахские (KK_FIELD_SYNONYMS).
 *
 * Сначала ищем точное совпадение заголовка по всем синонимам поля и только
 * потом — вхождение подстроки, причём подстрокой ищем лишь синонимы от трёх
 * знаков. Иначе короткий синоним забирает чужую колонку: «м²» после чистки
 * остаётся «м» и совпадает с «Помещение» и «Компания атауы», а казахское «ай»
 * (месяц) — с «мекенжайы». Точное совпадение при этом работает и для «С», «По».
 */
export function autoMapColumns(
  headers: string[],
  fieldSynonyms: Record<string, string[]>,
): Record<string, number> {
  const mapping: Record<string, number> = {}
  const normalized = headers.map(stripHeader)

  for (const [field, synonyms] of Object.entries(fieldSynonyms)) {
    const targets = [...synonyms, ...(KK_FIELD_SYNONYMS[field] ?? [])]
      .map(stripHeader)
      .filter(Boolean)

    let idx = -1
    for (const target of targets) {
      idx = normalized.indexOf(target)
      if (idx >= 0) break
    }
    if (idx < 0) {
      for (const target of targets) {
        if (target.length < 3) continue
        idx = normalized.findIndex((h) => h.includes(target))
        if (idx >= 0) break
      }
    }
    if (idx >= 0) mapping[field] = idx
  }
  return mapping
}

/**
 * Получает значение ячейки по полю-маппингу.
 */
export function getField(row: string[], mapping: Record<string, number>, field: string): string {
  const idx = mapping[field]
  if (idx === undefined || idx < 0 || idx >= row.length) return ""
  return (row[idx] ?? "").toString().trim()
}

/**
 * Парсит дату из разных форматов.
 * Поддерживает: ISO, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, Excel serial date.
 */
export function parseFlexibleDate(s: string): Date | null {
  if (!s) return null

  // Excel serial date (число дней от 1900-01-01)
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    if (serial > 0 && serial < 100000) {
      // Excel epoch is 1899-12-30 (учёт известной ошибки 1900)
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
    }
  }

  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3])))

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  const eu = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/)
  if (eu) {
    const year = eu[3].length === 2 ? 2000 + parseInt(eu[3]) : parseInt(eu[3])
    return new Date(Date.UTC(year, parseInt(eu[2]) - 1, parseInt(eu[1])))
  }

  // Fallback: js Date.parse
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t)

  return null
}

/**
 * Нормализует число — поддерживает запятую как десятичный разделитель,
 * пробелы и неразрывные пробелы.
 */
export function parseFlexibleNumber(s: string): number | null {
  if (!s) return null
  const cleaned = s.replace(/[\s ]/g, "").replace(",", ".").replace(/[^\d.\-]/g, "")
  const n = parseFloat(cleaned)
  return Number.isNaN(n) ? null : n
}

/**
 * Нормализует телефон в формат +7XXXXXXXXXX.
 */
export function normalizePhone(s: string): string {
  if (!s) return ""
  const digits = s.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return "+7" + digits.slice(1)
  }
  if (digits.length === 10) return "+7" + digits
  if (digits.length === 11 || digits.length === 12) return "+" + digits
  return s.trim()
}

/**
 * Тип легальной формы организации — нормализуем к {IP, TOO, AO, CHSI, PERSON}.
 */
// Казахские аббревиатуры юридической формы — не транслит, а самостоятельные
// сокращения: ИП → ЖК, ТОО → ЖШС, АО → АҚ, ЧСИ → ЖСО, физлицо → ЖТ. Шаблон
// импорта на казахском подсказывает именно их, значит разбор обязан их понимать.
export function normalizeLegalType(s: string): string {
  const v = s.trim().toUpperCase().replace(/["«»]/g, "")
  // ЖСО/ЧСИ проверяем первым: «жеке сот орындаушысы» содержит «жеке», иначе
  // частный судебный исполнитель ушёл бы в физлицо.
  if (/(^|\s)(ЧСИ|CHSI|ЖСО)(\s|$)/.test(v) || v.includes("СУДЕБН") || v.includes("ИСПОЛНИТЕЛ") || v.includes("ОРЫНДАУШЫ")) return "CHSI"
  if (/(^|\s)(ИП|ЖК)(\s|$)/.test(v) || v === "ИП" || v === "ЖК" || v.includes("КӘСІПКЕР")) return "IP"
  if (/(^|\s)(ТОО|TOO|OOO|ООО|LLP|ЖШС)(\s|$)/.test(v) || v === "ЖШС") return "TOO"
  if (/(^|\s)(АО|AO|АҚ)(\s|$)/.test(v) || v === "АҚ") return "AO"
  if (/(^|\s)(ФЛ|ФИЗ|PERSON|ИНДИВИД|ЖТ)(\s|$)/.test(v) || v === "ЖТ" || v.includes("ЖЕКЕ ТҰЛҒА")) return "PERSON"
  return "TOO" // default
}

/**
 * Извлекает БИН/ИИН (12 цифр) из строки. Может содержать пробелы и дефисы.
 */
export function extractBinIin(s: string): string {
  if (!s) return ""
  const digits = s.replace(/\D/g, "")
  if (digits.length === 12) return digits
  return ""
}
