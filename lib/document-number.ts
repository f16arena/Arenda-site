import "server-only"
import { db } from "@/lib/db"

/**
 * Номера документов организации (001, 002, …).
 *
 * Номер берётся из счётчика `document_counters` одним запросом
 * `UPDATE … RETURNING`: два документа, созданные одновременно, получают разные
 * номера. Раньше номер считался как «максимум + 1» отдельным запросом — при
 * одновременном создании выходил один и тот же номер, а для ЭСФ дубль
 * недопустим.
 *
 * Стартовый номер (продолжение нумерации из 1С) задаётся в Настройках и
 * хранится в Organization.docNumberStart.
 */

/** Документы с порядковой нумерацией организации. */
export const NUMBERED_DOC_TYPES = ["CONTRACT", "ACT", "INVOICE", "RECONCILIATION"] as const
export type NumberedDocType = (typeof NUMBERED_DOC_TYPES)[number]

const pad = (n: number) => String(n).padStart(3, "0")

/** Последний выданный номер по факту — максимум среди существующих документов. */
async function maxIssued(orgId: string, documentType: string): Promise<number> {
  // Договоры живут в своей таблице (Contract), остальные — в архиве документов.
  const rows = documentType === "CONTRACT"
    ? await db.contract.findMany({
        where: { tenant: { user: { organizationId: orgId } }, deletedAt: null },
        select: { number: true },
      })
    : await db.generatedDocument.findMany({
        where: { organizationId: orgId, documentType },
        select: { number: true },
      })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) max = Math.max(max, parseInt(t, 10))
  }
  return max
}

/** Нижняя граница из настроек («начать с номера»). */
async function startFloor(orgId: string, documentType: string): Promise<number> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } })
  const starts = (org?.docNumberStart ?? null) as Record<string, number> | null
  const v = starts?.[documentType]
  return typeof v === "number" && v > 0 ? v : 1
}

/**
 * Следующий номер документа. Атомарно увеличивает счётчик организации.
 * Если счётчика ещё нет (новая организация или новый вид документа) — заводим
 * его от максимума уже выданных номеров и стартового номера из настроек.
 */
export async function nextDocumentNumber(orgId: string, documentType: string): Promise<string> {
  const rows = await db.$queryRaw<Array<{ next_number: number }>>`
    UPDATE "document_counters"
    SET "next_number" = "next_number" + 1, "updated_at" = now()
    WHERE "organization_id" = ${orgId} AND "document_type" = ${documentType}
    RETURNING "next_number" - 1 AS next_number
  `
  if (rows.length > 0) return pad(rows[0].next_number)

  const seed = Math.max((await maxIssued(orgId, documentType)) + 1, await startFloor(orgId, documentType))
  const created = await db.$queryRaw<Array<{ next_number: number }>>`
    INSERT INTO "document_counters" ("organization_id", "document_type", "next_number", "updated_at")
    VALUES (${orgId}, ${documentType}, ${seed + 1}, now())
    ON CONFLICT ("organization_id", "document_type")
      DO UPDATE SET "next_number" = "document_counters"."next_number" + 1, "updated_at" = now()
    RETURNING "next_number" - 1 AS next_number
  `
  return pad(created[0]?.next_number ?? seed)
}

/** Для настроек: стартовый номер, последний выданный и следующий — по каждому виду. */
export async function getDocNumberingState(orgId: string): Promise<
  { type: NumberedDocType; start: number | null; last: number | null; next: string }[]
> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } })
  const starts = (org?.docNumberStart ?? null) as Record<string, number> | null
  const counters = await db.documentCounter.findMany({
    where: { organizationId: orgId, documentType: { in: [...NUMBERED_DOC_TYPES] } },
    select: { documentType: true, nextNumber: true },
  })

  return Promise.all(
    NUMBERED_DOC_TYPES.map(async (type) => {
      const last = await maxIssued(orgId, type)
      const start = starts && typeof starts[type] === "number" && starts[type] > 0 ? starts[type] : null
      const counter = counters.find((c) => c.documentType === type)?.nextNumber
      const next = counter ?? Math.max(last + 1, start ?? 1)
      return { type, start, last: last > 0 ? last : null, next: pad(next) }
    }),
  )
}

/**
 * Сдвинуть счётчик, если в настройках задали номер больше текущего.
 * Меньше уже выданного не ставим: дубли номеров недопустимы.
 */
export async function applyDocNumberStart(orgId: string, documentType: string, start: number): Promise<void> {
  const floor = Math.max(start, (await maxIssued(orgId, documentType)) + 1)
  await db.documentCounter.upsert({
    where: { organizationId_documentType: { organizationId: orgId, documentType } },
    update: { nextNumber: floor },
    create: { organizationId: orgId, documentType, nextNumber: floor },
  })
}

/**
 * Следующий номер договора. Раньше номера выдавались тремя разными способами:
 * конструктор — «максимум + 1», старые действия — через префикс здания
 * (F16-2026-001), а настройки показывали третий вариант. Теперь один счётчик.
 */
export async function nextContractNumber(orgId: string): Promise<string> {
  return nextDocumentNumber(orgId, "CONTRACT")
}
