"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { parseExcel, autoMapColumns, getField, parseFlexibleDate, parseFlexibleNumber, extractBinIin } from "@/lib/excel-import"

// История начислений: арендатор + период + тип + сумма (+ оплачено/срок).
const FIELD_SYNONYMS: Record<string, string[]> = {
  tenant: ["Арендатор", "Компания", "Контрагент", "Организация", "Название", "Наименование"],
  bin: ["БИН", "ИИН", "БИН/ИИН", "ИНН", "BIN"],
  period: ["Период", "Месяц", "За месяц", "Period"],
  type: ["Тип", "Вид", "Назначение", "Услуга", "Type"],
  amount: ["Сумма", "Начислено", "К оплате", "Amount", "Сумма ₸"],
  isPaid: ["Оплачено", "Статус", "Оплата", "Paid"],
  dueDate: ["Срок оплаты", "Срок", "Оплатить до", "Due"],
  description: ["Описание", "Комментарий", "Примечание", "Note"],
}

function mapType(raw: string): string {
  const s = raw.toLowerCase()
  if (/аренд|rent/.test(s)) return "RENT"
  if (/электр|elect|свет/.test(s)) return "ELECTRICITY"
  if (/вода|water|водоснаб/.test(s)) return "WATER"
  if (/отопл|heat|тепло/.test(s)) return "HEATING"
  if (/уборк|клининг|clean/.test(s)) return "CLEANING"
  if (/эксплуат|сервис|service|обслуж/.test(s)) return "SERVICE_FEE"
  if (/пени|штраф|penalt/.test(s)) return "PENALTY"
  if (/депозит|залог|deposit/.test(s)) return "DEPOSIT"
  if (!s) return "RENT"
  return "OTHER"
}

function isPaidValue(raw: string): boolean {
  return /оплач|да|yes|paid|true|1/i.test(raw.trim())
}

// Период → "YYYY-MM". Принимает уже-формат, дату, ММ.ГГГГ.
function normalizePeriod(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  const mY = /^(\d{1,2})[./\-](\d{4})$/.exec(s)
  if (mY) return `${mY[2]}-${mY[1].padStart(2, "0")}`
  const d = parseFlexibleDate(s)
  if (d) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  return null
}

export interface ParsedChargeRow {
  rowIndex: number
  data: { tenantId: string; tenantCompany: string; period: string; type: string; amount: number; isPaid: boolean; dueDate: Date | null; description: string }
  warnings: string[]
}

export interface ChargePreviewResult {
  totalRows: number
  validRows: ParsedChargeRow[]
  invalidRows: { rowIndex: number; error: string }[]
  unmappedFields: string[]
}

export async function previewChargeImport(formData: FormData): Promise<ChargePreviewResult> {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) throw new Error("Файл не передан")
  if (file.size > 10 * 1024 * 1024) throw new Error("Размер файла превышает 10 МБ")

  const buffer = Buffer.from(await file.arrayBuffer())
  const sheet = await parseExcel(buffer)
  const mapping = autoMapColumns(sheet.headers, FIELD_SYNONYMS)

  const unmapped = (["period", "amount"] as const).filter((f) => mapping[f] === undefined)
  if (unmapped.length > 0) {
    return { totalRows: sheet.rows.length, validRows: [], invalidRows: [], unmappedFields: [...unmapped] }
  }

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

  const validRows: ParsedChargeRow[] = []
  const invalidRows: { rowIndex: number; error: string }[] = []

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i]
    const rowIndex = i + 2
    const bin = extractBinIin(getField(row, mapping, "bin"))
    const tenantName = getField(row, mapping, "tenant").trim()
    const match = (bin && byTax.get(bin)) || (tenantName && byName.get(tenantName.toLowerCase())) || null
    if (!match) {
      invalidRows.push({ rowIndex, error: `Арендатор не найден (${tenantName || bin || "нет идентификатора"})` })
      continue
    }
    const period = normalizePeriod(getField(row, mapping, "period"))
    if (!period) {
      invalidRows.push({ rowIndex, error: `Не распознан период (${getField(row, mapping, "period")})` })
      continue
    }
    const amount = parseFlexibleNumber(getField(row, mapping, "amount"))
    if (amount === null || !(amount > 0)) {
      invalidRows.push({ rowIndex, error: "Сумма должна быть положительной" })
      continue
    }
    const type = mapType(getField(row, mapping, "type"))
    const isPaid = isPaidValue(getField(row, mapping, "isPaid"))
    const dueDate = parseFlexibleDate(getField(row, mapping, "dueDate"))
    const description = getField(row, mapping, "description")
    const warnings: string[] = []
    if (!isPaid) warnings.push("Начисление неоплачено — увеличит долг арендатора")

    validRows.push({
      rowIndex,
      data: { tenantId: match.id, tenantCompany: match.companyName, period, type, amount: Math.round(amount), isPaid, dueDate, description },
      warnings,
    })
  }

  return { totalRows: sheet.rows.length, validRows, invalidRows, unmappedFields: [] }
}

export interface ChargeImportResult {
  created: number
  skipped: number
  errors: { rowIndex: number; error: string }[]
}

export async function applyChargeImport(rows: ParsedChargeRow[]): Promise<ChargeImportResult> {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()

  const result: ChargeImportResult = { created: 0, skipped: 0, errors: [] }

  for (const row of rows) {
    try {
      const d = row.data
      const tenant = await db.tenant.findFirst({ where: { id: d.tenantId, user: { organizationId: orgId } }, select: { id: true } })
      if (!tenant) {
        result.errors.push({ rowIndex: row.rowIndex, error: "Арендатор вне организации" })
        continue
      }
      // Дедуп по уникальному ключу charges (tenant+period+type, deleted_at IS NULL).
      const existing = await db.charge.findFirst({ where: { tenantId: d.tenantId, period: d.period, type: d.type }, select: { id: true } })
      if (existing) {
        result.skipped++
        continue
      }
      await db.charge.create({
        data: {
          tenantId: d.tenantId,
          period: d.period,
          type: d.type,
          amount: d.amount,
          description: d.description || `Импорт: ${d.type} за ${d.period}`,
          isPaid: d.isPaid,
          dueDate: d.dueDate ?? new Date(Number(d.period.slice(0, 4)), Number(d.period.slice(5, 7)) - 1, 10),
        },
      })
      result.created++
    } catch (e) {
      result.errors.push({ rowIndex: row.rowIndex, error: e instanceof Error ? e.message : String(e) })
    }
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/tenants")
  return result
}
