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
