"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { parseExcel, autoMapColumns, getField, parseFlexibleDate, extractBinIin } from "@/lib/excel-import"

// Реестр договоров: номер + идентификатор арендатора (БИН/ИИН или название) + даты + статус.
const FIELD_SYNONYMS: Record<string, string[]> = {
  number: ["Номер", "№", "Номер договора", "Договор", "№ договора", "Number", "Договор №"],
  tenant: ["Арендатор", "Компания", "Контрагент", "Организация", "Название", "Наименование"],
  bin: ["БИН", "ИИН", "БИН/ИИН", "ИНН", "BIN"],
  startDate: ["Дата начала", "Начало", "Дата договора", "Дата", "С", "Start"],
  endDate: ["Дата окончания", "Окончание", "Действует до", "По", "End"],
  status: ["Статус", "Состояние", "Status"],
  type: ["Тип", "Вид", "Type"],
}

// Сопоставление текста статуса из файла → статус договора в системе. Реестр = реальные
// заключённые договоры, поэтому по умолчанию SIGNED.
function mapStatus(raw: string): string {
  const s = raw.toLowerCase()
  if (/черновик|draft/.test(s)) return "DRAFT"
  if (/истёк|истек|expired|законч|заверш/.test(s)) return "EXPIRED"
  if (/отклон|reject|расторг|terminat|растор/.test(s)) return "REJECTED"
  if (/подпис|signed|действ|актив|active/.test(s)) return "SIGNED"
  return "SIGNED"
}

export interface ParsedContractRow {
  rowIndex: number
  data: {
    number: string
    tenantId: string
    tenantCompany: string
    startDate: Date | null
    endDate: Date | null
    status: string
    type: string
  }
  warnings: string[]
}

export interface ContractPreviewResult {
  totalRows: number
  validRows: ParsedContractRow[]
  invalidRows: { rowIndex: number; error: string }[]
  unmappedFields: string[]
}

export async function previewContractImport(formData: FormData): Promise<ContractPreviewResult> {
  await requireCapabilityAndFeature("documents.create")
  const { orgId } = await requireOrgAccess()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) throw new Error("Файл не передан")
  if (file.size > 10 * 1024 * 1024) throw new Error("Размер файла превышает 10 МБ")

  const buffer = Buffer.from(await file.arrayBuffer())
  const sheet = await parseExcel(buffer)
  const mapping = autoMapColumns(sheet.headers, FIELD_SYNONYMS)

  const unmapped = (["number"] as const).filter((f) => mapping[f] === undefined)
  if (unmapped.length > 0) {
    return { totalRows: sheet.rows.length, validRows: [], invalidRows: [], unmappedFields: [...unmapped] }
  }

  // Арендаторы организации → карты для матчинга (по БИН/ИИН и по названию).
  const tenants = await db.tenant.findMany({
    where: { user: { organizationId: orgId }, deletedAt: null },
    select: { id: true, companyName: true, bin: true, iin: true },
  })
  const byTax = new Map<string, { id: string; companyName: string }>()
  const byName = new Map<string, { id: string; companyName: string }>()
  for (const t of tenants) {
    if (t.bin) byTax.set(t.bin, { id: t.id, companyName: t.companyName })
    if (t.iin) byTax.set(t.iin, { id: t.id, companyName: t.companyName })
    byName.set(t.companyName.trim().toLowerCase(), { id: t.id, companyName: t.companyName })
  }

  const validRows: ParsedContractRow[] = []
  const invalidRows: { rowIndex: number; error: string }[] = []

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]
    const rowIndex = i + 2
    const number = getField(row, mapping, "number").trim()
    if (!number) {
      invalidRows.push({ rowIndex, error: "Пустой номер договора" })
      continue
    }
    const bin = extractBinIin(getField(row, mapping, "bin"))
    const tenantName = getField(row, mapping, "tenant").trim()
    const match = (bin && byTax.get(bin)) || (tenantName && byName.get(tenantName.toLowerCase())) || null
    if (!match) {
      invalidRows.push({ rowIndex, error: `Арендатор не найден (${tenantName || bin || "нет идентификатора"})` })
      continue
    }
    const startDate = parseFlexibleDate(getField(row, mapping, "startDate"))
    const endDate = parseFlexibleDate(getField(row, mapping, "endDate"))
    const status = mapStatus(getField(row, mapping, "status"))
    const rawType = getField(row, mapping, "type").trim()
    const type = /внешн|external|pdf/i.test(rawType) ? "EXTERNAL" : "STANDARD"
    const warnings: string[] = []
    if (endDate && startDate && endDate < startDate) warnings.push("Дата окончания раньше начала")

    validRows.push({
      rowIndex,
      data: { number, tenantId: match.id, tenantCompany: match.companyName, startDate, endDate, status, type },
      warnings,
    })
  }

  return { totalRows: sheet.rows.length, validRows, invalidRows, unmappedFields: [] }
}

export interface ContractImportResult {
  created: number
  skipped: number
  errors: { rowIndex: number; error: string }[]
}

export async function applyContractImport(rows: ParsedContractRow[]): Promise<ContractImportResult> {
  await requireCapabilityAndFeature("documents.create")
  const { orgId } = await requireOrgAccess()

  const result: ContractImportResult = { created: 0, skipped: 0, errors: [] }

  for (const row of rows) {
    try {
      const d = row.data
      // Защита: арендатор действительно в этой организации.
      const tenant = await db.tenant.findFirst({ where: { id: d.tenantId, user: { organizationId: orgId } }, select: { id: true } })
      if (!tenant) {
        result.errors.push({ rowIndex: row.rowIndex, error: "Арендатор вне организации" })
        continue
      }
      // Дедуп: договор с таким номером у этого арендатора уже есть.
      const existing = await db.contract.findFirst({ where: { tenantId: d.tenantId, number: d.number }, select: { id: true } })
      if (existing) {
        result.skipped++
        continue
      }
      await db.contract.create({
        data: {
          tenantId: d.tenantId,
          number: d.number,
          type: d.type,
          content: `Договор аренды № ${d.number}`,
          status: d.status,
          startDate: d.startDate,
          endDate: d.endDate,
          version: 1,
        },
      })
      result.created++
    } catch (e) {
      result.errors.push({ rowIndex: row.rowIndex, error: e instanceof Error ? e.message : String(e) })
    }
  }

  revalidatePath("/admin/documents")
  revalidatePath("/admin/tenants")
  return result
}
