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
    const xml = zip.file("word/document.xml")?.asText() ?? ""
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
 * Заменяет {placeholder} в строковых ячейках на значения.
 */
export async function renderXlsx(templateBuffer: Buffer, data: Record<string, unknown>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(templateBuffer as any)

  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string" && cell.value.includes("{")) {
          cell.value = cell.value.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}/g, (_, key: string) => {
            const v = resolveDeep(data, key)
            return v === null || v === undefined ? "" : String(v)
          })
        }
      })
    })
  })

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
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
