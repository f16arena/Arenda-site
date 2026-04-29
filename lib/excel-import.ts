import ExcelJS from "exceljs"

/**
 * Утилиты для парсинга Excel-файлов и нормализации значений.
 *
 * Поддерживаются форматы:
 *  - .xlsx (основной)
 *  - .csv (через ExcelJS read csv)
 */

export interface SheetData {
  headers: string[]
  rows: string[][]
}

/**
 * Читает первый лист Excel-файла как массив массивов строк.
 * Пустые строки и колонки (полностью без данных) пропускаются.
 */
export async function parseExcel(buffer: Buffer | ArrayBuffer): Promise<SheetData> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS типы конфликтуют с Node Buffer<ArrayBufferLike> — приводим через unknown
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error("Файл пуст или повреждён")

  const rows: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value))
    })
    rows.push(cells)
  })

  if (rows.length === 0) throw new Error("Лист пустой")

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
 * Auto-mapping колонок Excel на поля схемы.
 * Принимает массив заголовков и словарь синонимов, возвращает индексы.
 */
export function autoMapColumns(
  headers: string[],
  fieldSynonyms: Record<string, string[]>,
): Record<string, number> {
  const mapping: Record<string, number> = {}
  const normalized = headers.map((h) => h.toLowerCase().replace(/[^a-zа-я0-9]/gi, ""))

  for (const [field, synonyms] of Object.entries(fieldSynonyms)) {
    for (const syn of synonyms) {
      const target = syn.toLowerCase().replace(/[^a-zа-я0-9]/gi, "")
      const idx = normalized.findIndex((h) => h === target || h.includes(target))
      if (idx >= 0) {
        mapping[field] = idx
        break
      }
    }
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
 * Тип легальной формы организации — нормализуем к {IP, TOO, AO, OTHER}.
 */
export function normalizeLegalType(s: string): string {
  const v = s.trim().toUpperCase().replace(/["«»]/g, "")
  if (/(^|\s)ИП(\s|$)/.test(v) || v === "ИП") return "IP"
  if (/(^|\s)(ТОО|TOO|OOO|ООО|LLP)(\s|$)/.test(v)) return "TOO"
  if (/(^|\s)(АО|AO)(\s|$)/.test(v)) return "AO"
  if (/(^|\s)(ФЛ|ФИЗ|PERSON|ИНДИВИД)(\s|$)/.test(v)) return "PERSON"
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
