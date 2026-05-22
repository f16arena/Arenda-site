// Движок подстановки данных в кастомные шаблоны документов.
//
//   DOCX → docxtemplater (placeholder'ы вида {tenant_name})
//   XLSX → ExcelJS (placeholder'ы в ячейках, заменяются на values)
//   PDF  → не поддерживается для генерации, только как preview-превью
//          (сохраняется как образец вида)

import "server-only"
import Docxtemplater from "docxtemplater"
import PizZip from "pizzip"
import ExcelJS from "exceljs"

export { PLACEHOLDER_DOCS, type DocumentType } from "@/lib/template-placeholders"
export type TemplateFormat = "DOCX" | "XLSX" | "PDF"

/**
 * Распознать формат файла по имени и контенту.
 */
export function detectFormat(fileName: string, mime?: string): TemplateFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX"
  if (lower.endsWith(".xlsx") || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "XLSX"
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "PDF"
  return null
}

/**
 * Извлекает все placeholder'ы из DOCX-шаблона.
 * Используется для валидации: какие поля юзер заюзал.
 */
export function extractDocxPlaceholders(buffer: Buffer): string[] {
  try {
    const zip = new PizZip(buffer)
    const xml = zip
      .file(/word\/(document|header|footer|footnotes|endnotes).*\.xml/)
      .map((file) => file.asText())
      .join("")
      .replace(/<[^>]+>/g, "")
    const matches = Array.from(xml.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g))
    return [...new Set(matches.map((m) => m[1]))]
  } catch {
    return []
  }
}

/**
 * Извлекает placeholder'ы из XLSX-шаблона (из всех ячеек всех листов).
 */
export async function extractXlsxPlaceholders(buffer: Buffer): Promise<string[]> {
  try {
    const wb = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any)
    const placeholders = new Set<string>()
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value
          if (typeof v === "string") {
            const ms = v.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g)
            for (const m of ms) placeholders.add(m[1])
          }
        })
      })
    })
    return Array.from(placeholders)
  } catch {
    return []
  }
}

/**
 * Подставить данные в DOCX-шаблон.
 * Возвращает готовый Buffer с заполненным документом.
 */
export function renderDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(templateBuffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  })
  doc.render(data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" } as any)
  return out as unknown as Buffer
}

/**
 * Подставить данные в XLSX-шаблон.
 *
 * ВАЖНО: правим XML ПРЯМО в шаблоне (через PizZip), БЕЗ пересборки книги через
 * ExcelJS. ExcelJS при load→write меняет структуру листа так, что строгий
 * загрузчик Excel (Office LTSC) отвергает файл («ошибка загрузки sheet1.xml»),
 * хотя файл валиден по XML/схеме. Сохраняем zip БЕЗ сжатия (STORE): этот Excel
 * не разжимает DEFLATE-поток pizzip/exceljs. Исходный шаблон при этом остаётся
 * нетронутым по структуре → открывается.
 *
 * Поддерживается:
 *   - скалярные метки {key} / {a.b.c};
 *   - ОДНОСТРОЧНЫЙ цикл {#items}…{@index}…{field}…{/items}: строка-шаблон
 *     размножается на длину массива, строки ниже и merge'ы сдвигаются.
 */
export async function renderXlsx(templateBuffer: Buffer, data: Record<string, unknown>): Promise<Buffer> {
  const zip = new PizZip(templateBuffer)

  // Нормализуем shared strings → inline: метки (в т.ч. цикла {#items}) могут
  // лежать в sharedStrings.xml, а правим мы XML листа. После инлайна обработка
  // одинакова для любых шаблонов (inline/shared).
  const shared = parseSharedStrings(zip)

  for (const file of zip.file(/xl\/worksheets\/sheet\d+\.xml$/)) {
    let xml = file.asText()
    if (shared.length) xml = inlineSharedStrings(xml, shared)
    xml = expandLoopInSheetXml(xml, data)
    xml = replaceScalarsInXml(xml, data)
    zip.file(file.name, xml)
  }

  // sharedStrings: подставить скаляры на случай неинлайненных ссылок (defensive)
  const ss = zip.file("xl/sharedStrings.xml")
  if (ss) zip.file("xl/sharedStrings.xml", replaceScalarsInXml(ss.asText(), data))

  // Defensive: нормализовать пустой patternFill (на случай кривого шаблона)
  const styles = zip.file("xl/styles.xml")
  if (styles) {
    const fixed = styles.asText()
      .replace(/<patternFill\s*\/>/g, '<patternFill patternType="none"/>')
      .replace(/<patternFill>\s*<\/patternFill>/g, '<patternFill patternType="none"/>')
    zip.file("xl/styles.xml", fixed)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zip.generate({ type: "nodebuffer", compression: "STORE" } as any) as unknown as Buffer
}

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g

/** Внутренний XML каждой строки <si> из sharedStrings.xml (например "<t>…</t>"). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSharedStrings(zip: any): string[] {
  const ss = zip.file("xl/sharedStrings.xml")
  if (!ss) return []
  const text: string = ss.asText()
  return [...text.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1])
}

/** Заменяет ячейки t="s" (ссылки на shared strings) на inline-строки. */
function inlineSharedStrings(xml: string, shared: string[]): string {
  return xml.replace(/<c\b([^>]*)>\s*<v>(\d+)<\/v>\s*<\/c>/g, (full, attrs: string, idx: string) => {
    if (!/\bt="s"/.test(attrs)) return full // только shared-string ячейки
    const inner = shared[parseInt(idx, 10)] ?? "<t></t>"
    return `<c${attrs.replace(/\bt="s"/, 't="inlineStr"')}><is>${inner}</is></c>`
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function replaceScalarsInXml(xml: string, data: Record<string, unknown>): string {
  return xml.replace(PLACEHOLDER_RE, (_, key: string) => {
    const v = resolveDeep(data, key)
    return v === null || v === undefined ? "" : escapeXml(String(v))
  })
}

/**
 * Раскрывает однострочный цикл {#key}…{/key} прямо в XML листа.
 * Шаблонная строка размножается на длину массива; строки ниже и merge'ы
 * сдвигаются на (n-1); dimension расширяется.
 */
function expandLoopInSheetXml(xml: string, data: Record<string, unknown>): string {
  const keyMatch = xml.match(/\{#([a-zA-Z_][a-zA-Z0-9_]*)\}/)
  if (!keyMatch) return xml
  const key = keyMatch[1]
  const arr = (data as Record<string, unknown>)[key]
  const items: unknown[] = Array.isArray(arr) ? arr : []

  const sd = xml.match(/(<sheetData[^>]*>)([\s\S]*?)(<\/sheetData>)/)
  if (!sd) return xml
  const rows = [...sd[2].matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => m[0])
  const li = rows.findIndex((r) => r.includes(`{#${key}}`) && r.includes(`{/${key}}`))
  if (li < 0) return xml // маркеры в разных строках — не поддерживаем

  const loopRow = rows[li]
  const R = parseInt((loopRow.match(/\br="(\d+)"/) ?? ["", "0"])[1], 10)
  const delta = items.length - 1

  const out: string[] = []
  for (let idx = 0; idx < rows.length; idx++) {
    if (idx < li) { out.push(rows[idx]); continue }
    if (idx === li) {
      for (let i = 0; i < items.length; i++) {
        let rx = setRowNumber(loopRow, R, R + i)
        rx = rx.split(`{#${key}}`).join("").split(`{/${key}}`).join("")
        rx = rx.replace(/\{@index\}/g, String(i + 1))
        rx = rx.replace(PLACEHOLDER_RE, (_, k: string) => {
          let v = resolveDeep(items[i] as Record<string, unknown>, k)
          if (v === undefined) v = resolveDeep(data, k)
          return v === null || v === undefined ? "" : escapeXml(String(v))
        })
        out.push(rx)
      }
      continue
    }
    // idx > li
    const oldN = parseInt((rows[idx].match(/\br="(\d+)"/) ?? ["", "0"])[1], 10)
    out.push(delta === 0 ? rows[idx] : setRowNumber(rows[idx], oldN, oldN + delta))
  }

  let result = xml.slice(0, sd.index) + sd[1] + out.join("") + sd[3] + xml.slice((sd.index ?? 0) + sd[0].length)
  if (delta !== 0) {
    result = shiftMergeCells(result, R, delta, items.length)
    result = result.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)("\s*\/>)/, (_, p1, r, p3) => `${p1}${parseInt(r, 10) + delta}${p3}`)
  }
  return result
}

/** Меняет номер строки и r-ссылки её ячеек (oldN → newN). */
function setRowNumber(rowXml: string, oldN: number, newN: number): string {
  if (oldN === newN) return rowXml
  return rowXml
    .replace(new RegExp(`(<row\\b[^>]*\\br=")${oldN}(")`), `$1${newN}$2`)
    .replace(new RegExp(`(<c\\b[^>]*\\br="[A-Z]+)${oldN}(")`, "g"), `$1${newN}$2`)
}

/** Сдвиг/размножение merge'ов: ниже R → +delta, на строке R → реплика на каждую из n строк. */
function shiftMergeCells(xml: string, R: number, delta: number, n: number): string {
  const mc = xml.match(/<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/)
  if (!mc) return xml
  const refs = [...mc[1].matchAll(/<mergeCell ref="([^"]+)"\s*\/>/g)].map((m) => m[1])
  const outRefs: string[] = []
  for (const ref of refs) {
    const [a, b] = ref.split(":")
    const pa = parseAddr(a)
    const pb = parseAddr(b ?? a)
    const top = Math.min(pa.r, pb.r)
    const bot = Math.max(pa.r, pb.r)
    if (bot < R) { outRefs.push(ref); continue }
    if (top === R && bot === R) {
      for (let i = 0; i < n; i++) outRefs.push(`${pa.col}${R + i}:${pb.col}${R + i}`)
      continue
    }
    if (top > R) { outRefs.push(`${pa.col}${top + delta}:${pb.col}${bot + delta}`); continue }
    outRefs.push(`${pa.col}${top}:${pb.col}${bot + delta}`) // пересекает R
  }
  const rebuilt = `<mergeCells count="${outRefs.length}">${outRefs.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>`
  return xml.replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/, rebuilt)
}

function parseAddr(addr: string): { col: string; r: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/)
  if (!m) return { col: "A", r: 1 }
  return { col: m[1], r: parseInt(m[2], 10) }
}

/**
 * Резолвит вложенные ключи: tenant.name → data.tenant.name.
 */
function resolveDeep(obj: Record<string, unknown>, path: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[part]
  }
  return cur
}
