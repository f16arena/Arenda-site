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
 * Поддерживается:
 *   - скалярные метки {key} / {a.b.c} в любых ячейках;
 *   - ОДНОСТРОЧНЫЙ цикл {#items}…{@index}…{field}…{/items}: строка с маркерами
 *     размножается на длину массива data.items, стили и объединённые ячейки
 *     (merge) копируются построчно, всё ниже сдвигается вниз.
 *
 * Многострочное тело цикла (маркеры открытия/закрытия в разных строках) НЕ
 * поддерживается — для xlsx это редкий кейс и ломает merge'ы.
 */
export async function renderXlsx(templateBuffer: Buffer, data: Record<string, unknown>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(templateBuffer as any)

  wb.eachSheet((ws) => {
    expandSingleRowLoop(ws, data)
    // Плоская замена оставшихся скалярных меток.
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string" && cell.value.includes("{")) {
          cell.value = replaceScalars(cell.value, data)
        }
      })
    })
  })

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g

function replaceScalars(text: string, data: Record<string, unknown>): string {
  return text.replace(PLACEHOLDER_RE, (_, key: string) => {
    const v = resolveDeep(data, key)
    return v === null || v === undefined ? "" : String(v)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expandSingleRowLoop(ws: any, data: Record<string, unknown>): void {
  const loop = findLoopRow(ws)
  if (!loop) return

  const R = loop.row
  const arr = (data as Record<string, unknown>)[loop.key]
  const items = Array.isArray(arr) ? arr : []
  const n = items.length

  // Шаблон строки цикла: значение + стиль каждой ячейки с контентом.
  const tmpl: { col: number; text: unknown; style: unknown }[] = []
  ws.getRow(R).eachCell({ includeEmpty: false }, (cell: { value: unknown; style: unknown }, col: number) => {
    tmpl.push({ col, text: cell.value, style: cell.style })
  })
  const rowHeight: number | undefined = ws.getRow(R).height

  // Разбор merge'ов: внутри строки цикла / выше / ниже.
  const allMerges: string[] = (ws.model?.merges ?? []).slice()
  const loopMerges: { l: number; r: number }[] = []
  const aboveMerges: string[] = []
  const belowMerges: { l: number; r: number; t: number; b: number }[] = []
  for (const m of allMerges) {
    const p = parseMerge(m)
    if (p.t === R && p.b === R) loopMerges.push({ l: p.l, r: p.r })
    else if (p.t > R) belowMerges.push(p)
    else aboveMerges.push(m) // выше или пересекающие — оставляем как есть
  }

  // Снять все merge'ы, чтобы вставка/удаление строк не конфликтовали.
  for (const m of allMerges) {
    try { ws.unMergeCells(m) } catch { /* ignore */ }
  }

  const delta = n - 1
  if (n === 0) {
    ws.spliceRows(R, 1)
  } else if (delta > 0) {
    ws.spliceRows(R + 1, 0, ...Array.from({ length: delta }, () => []))
  }

  // Заполнить строки цикла.
  for (let i = 0; i < n; i++) {
    const target = R + i
    if (rowHeight) ws.getRow(target).height = rowHeight
    for (const t of tmpl) {
      const cell = ws.getCell(target, t.col)
      cell.value = typeof t.text === "string"
        ? renderItemText(t.text, items[i] as Record<string, unknown>, i, data, loop.key)
        : t.text
      if (t.style) cell.style = t.style as never
    }
    for (const lm of loopMerges) {
      try { ws.mergeCells(target, lm.l, target, lm.r) } catch { /* ignore */ }
    }
  }

  // Восстановить merge'ы выше (без изменений) и ниже (сдвиг на delta).
  for (const m of aboveMerges) {
    try { ws.mergeCells(m) } catch { /* ignore */ }
  }
  for (const p of belowMerges) {
    try { ws.mergeCells(p.t + delta, p.l, p.b + delta, p.r) } catch { /* ignore */ }
  }
}

function renderItemText(
  text: string,
  item: Record<string, unknown>,
  index: number,
  data: Record<string, unknown>,
  key: string,
): string {
  let s = text.split(`{#${key}}`).join("").split(`{/${key}}`).join("")
  s = s.replace(/\{@index\}/g, String(index + 1))
  return s.replace(PLACEHOLDER_RE, (_, k: string) => {
    let v = resolveDeep(item, k)
    if (v === undefined) v = resolveDeep(data, k) // общие скаляры внутри строки
    return v === null || v === undefined ? "" : String(v)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findLoopRow(ws: any): { row: number; key: string } | null {
  let result: { row: number; key: string } | null = null
  ws.eachRow((row: { eachCell: (cb: (c: { value: unknown }) => void) => void }, rn: number) => {
    if (result) return
    row.eachCell((cell: { value: unknown }) => {
      if (result) return
      if (typeof cell.value === "string") {
        const m = cell.value.match(/\{#([a-zA-Z_][a-zA-Z0-9_]*)\}/)
        if (m) result = { row: rn, key: m[1] }
      }
    })
  })
  return result
}

function parseMerge(range: string): { l: number; r: number; t: number; b: number } {
  const [a, b] = range.split(":")
  const pa = parseAddr(a)
  const pb = parseAddr(b ?? a)
  return {
    l: Math.min(pa.c, pb.c),
    r: Math.max(pa.c, pb.c),
    t: Math.min(pa.r, pb.r),
    b: Math.max(pa.r, pb.r),
  }
}

function parseAddr(addr: string): { c: number; r: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/)
  if (!m) return { c: 1, r: 1 }
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { c, r: parseInt(m[2], 10) }
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
