import "server-only"
import { db } from "@/lib/db"

/**
 * Следующий номер документа организации (001, 002, …) среди чисто числовых
 * номеров данного типа в архиве GeneratedDocument. Общий для конструкторов
 * и автоматической генерации — чтобы нумерация не расходилась.
 */
export async function nextDocumentNumber(orgId: string, documentType: string): Promise<string> {
  const [rows, org] = await Promise.all([
    db.generatedDocument.findMany({
      where: { organizationId: orgId, documentType },
      select: { number: true },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } }),
  ])
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10)
      if (n > max) max = n
    }
  }
  // Стартовый номер (продолжение нумерации из 1С): { "ACT": 58, "INVOICE": 28 }.
  // Это НИЖНЯЯ граница «следующего» номера, если своих документов ещё нет/меньше.
  const starts = (org?.docNumberStart ?? null) as Record<string, number> | null
  const floor = starts && typeof starts[documentType] === "number" && starts[documentType] > 0
    ? starts[documentType]
    : 1
  const next = Math.max(max + 1, floor)
  return String(next).padStart(3, "0")
}

/** Документы с порядковой нумерацией организации (продолжение из 1С). */
export const NUMBERED_DOC_TYPES = ["ACT", "INVOICE", "RECONCILIATION"] as const
export type NumberedDocType = (typeof NUMBERED_DOC_TYPES)[number]

/** Для настроек: стартовый номер, последний выставленный и следующий — по каждому виду. */
export async function getDocNumberingState(orgId: string): Promise<
  { type: NumberedDocType; start: number | null; last: number | null; next: string }[]
> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } })
  const starts = (org?.docNumberStart ?? null) as Record<string, number> | null
  return Promise.all(
    NUMBERED_DOC_TYPES.map(async (type) => {
      const rows = await db.generatedDocument.findMany({ where: { organizationId: orgId, documentType: type }, select: { number: true } })
      let last = 0
      for (const r of rows) {
        const t = (r.number ?? "").trim()
        if (/^\d+$/.test(t)) last = Math.max(last, parseInt(t, 10))
      }
      const start = starts && typeof starts[type] === "number" && starts[type] > 0 ? starts[type] : null
      return { type, start, last: last > 0 ? last : null, next: await nextDocumentNumber(orgId, type) }
    }),
  )
}
