import "server-only"
import { db } from "@/lib/db"

/**
 * Следующий номер документа организации (001, 002, …) среди чисто числовых
 * номеров данного типа в архиве GeneratedDocument. Общий для конструкторов
 * и автоматической генерации — чтобы нумерация не расходилась.
 */
export async function nextDocumentNumber(orgId: string, documentType: string): Promise<string> {
  const rows = await db.generatedDocument.findMany({
    where: { organizationId: orgId, documentType },
    select: { number: true },
  })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10)
      if (n > max) max = n
    }
  }
  return String(max + 1).padStart(3, "0")
}
