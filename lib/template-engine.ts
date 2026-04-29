// Движок подстановки данных в кастомные шаблоны документов.
//
//   DOCX → docxtemplater (placeholder'ы вида {tenant_name})
//   XLSX → ExcelJS (placeholder'ы в ячейках, заменяются на values)
//   PDF  → не поддерживается для генерации, только как preview-превью
//          (сохраняется как образец вида)

import Docxtemplater from "docxtemplater"
import PizZip from "pizzip"
import ExcelJS from "exceljs"

export type DocumentType = "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION"
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

/**
 * Список placeholder'ов для каждого типа документа — для отображения
 * пользователю при загрузке шаблона ("какие поля доступны").
 */
export const PLACEHOLDER_DOCS: Record<DocumentType, { key: string; label: string }[]> = {
  CONTRACT: [
    { key: "contract_number", label: "Номер договора" },
    { key: "contract_date", label: "Дата договора" },
    { key: "tenant_name", label: "Название арендатора" },
    { key: "tenant_bin", label: "БИН/ИИН арендатора" },
    { key: "tenant_address", label: "Адрес арендатора" },
    { key: "tenant_director", label: "Директор арендатора" },
    { key: "landlord_name", label: "Название арендодателя" },
    { key: "landlord_bin", label: "БИН арендодателя" },
    { key: "landlord_address", label: "Адрес арендодателя" },
    { key: "landlord_director", label: "Директор арендодателя" },
    { key: "building_address", label: "Адрес объекта" },
    { key: "space_number", label: "Номер помещения" },
    { key: "space_area", label: "Площадь, м²" },
    { key: "monthly_rent", label: "Арендная плата, ₸/мес" },
    { key: "rent_in_words", label: "Сумма прописью" },
    { key: "start_date", label: "Дата начала" },
    { key: "end_date", label: "Дата окончания" },
    { key: "payment_due_day", label: "Срок оплаты (число)" },
    { key: "penalty_percent", label: "Размер пени, %/день" },
  ],
  INVOICE: [
    { key: "invoice_number", label: "Номер счёта" },
    { key: "invoice_date", label: "Дата счёта" },
    { key: "due_date", label: "Срок оплаты" },
    { key: "period", label: "Период (Апрель 2026)" },
    { key: "tenant_name", label: "Название плательщика" },
    { key: "tenant_bin", label: "БИН/ИИН плательщика" },
    { key: "tenant_address", label: "Адрес плательщика" },
    { key: "tenant_iik", label: "ИИК плательщика" },
    { key: "tenant_bank", label: "Банк плательщика" },
    { key: "landlord_name", label: "Название поставщика" },
    { key: "landlord_bin", label: "БИН поставщика" },
    { key: "landlord_iik", label: "ИИК поставщика" },
    { key: "landlord_bik", label: "БИК поставщика" },
    { key: "landlord_bank", label: "Банк поставщика" },
    { key: "subtotal", label: "Сумма без НДС" },
    { key: "vat_rate", label: "Ставка НДС, %" },
    { key: "vat_amount", label: "Сумма НДС" },
    { key: "total", label: "Всего к оплате" },
    { key: "total_in_words", label: "Сумма прописью" },
    { key: "contract_number", label: "Номер договора" },
    { key: "purpose", label: "Назначение платежа" },
    { key: "items", label: "Список услуг (#each items)" },
  ],
  ACT: [
    { key: "act_number", label: "Номер акта" },
    { key: "act_date", label: "Дата акта" },
    { key: "period_start", label: "Период от" },
    { key: "period_end", label: "Период до" },
    { key: "tenant_name", label: "Заказчик — название" },
    { key: "tenant_bin", label: "Заказчик — БИН/ИИН" },
    { key: "tenant_director", label: "Заказчик — директор" },
    { key: "landlord_name", label: "Исполнитель — название" },
    { key: "landlord_bin", label: "Исполнитель — БИН" },
    { key: "landlord_director", label: "Исполнитель — директор" },
    { key: "subtotal", label: "Сумма без НДС" },
    { key: "vat_rate", label: "Ставка НДС, %" },
    { key: "vat_amount", label: "НДС" },
    { key: "total", label: "Всего" },
    { key: "total_in_words", label: "Сумма прописью" },
    { key: "contract_number", label: "Номер договора" },
    { key: "items", label: "Список услуг (#each items)" },
  ],
  RECONCILIATION: [
    { key: "period_start", label: "Начало периода" },
    { key: "period_end", label: "Конец периода" },
    { key: "tenant_name", label: "Контрагент" },
    { key: "tenant_bin", label: "БИН контрагента" },
    { key: "landlord_name", label: "Наша организация" },
    { key: "landlord_bin", label: "БИН наш" },
    { key: "total_debit", label: "Всего начислено" },
    { key: "total_credit", label: "Всего оплачено" },
    { key: "balance", label: "Сальдо" },
    { key: "balance_in_words", label: "Сальдо прописью" },
    { key: "entries", label: "Список операций (#each entries)" },
  ],
}
