import "server-only"
import { db } from "@/lib/db"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"
import { renderAvrDocx } from "@/lib/avr-engine/docx"
import type { InvoiceState } from "@/lib/invoice-engine"
import type { AvrState } from "@/lib/avr-engine"
import type { SignStamp } from "@/lib/doc-sign-stamp"

interface SignedDocRow {
  id: string
  documentType: string
  sourceState: unknown
}

/**
 * Пересобирает ПОДПИСАННЫЙ счёт/АВР в DOCX со штампами ЭЦП (по реальным
 * DocumentSignature + TSP) и QR-кодом на страницу проверки `/verify/{id}` —
 * по аналогии с buildSignedContractDocxBuffer для договора.
 *
 * Возвращает null, если:
 *  - тип документа не счёт/АВР,
 *  - нет сохранённого исходного состояния (старые документы — пересобрать нечем),
 *  - документ ещё не подписан (пересборка не нужна, отдаём оригинал).
 */
export async function buildSignedGeneratedDocxBuffer(doc: SignedDocRow): Promise<Buffer | null> {
  if (!doc.sourceState) return null
  if (doc.documentType !== "INVOICE" && doc.documentType !== "ACT") return null

  const sigs = await db.documentSignature.findMany({
    where: { documentType: doc.documentType, documentId: doc.id },
    select: { signerName: true, signerIin: true, signerOrgBin: true, signedAt: true, tspGenTime: true },
    orderBy: { signedAt: "asc" },
  })
  if (sigs.length === 0) return null

  const digits = (v?: string | null) => String(v ?? "").replace(/\D/g, "")
  const fmtDt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined

  const stampOf = (s: (typeof sigs)[number]): SignStamp => ({
    name: s.signerName,
    taxId: digits(s.signerOrgBin) || digits(s.signerIin) || undefined,
    signedAt: fmtDt(s.signedAt),
    tspTime: fmtDt(s.tspGenTime),
    method: "Документ подписан ЭЦП (НУЦ РК)",
  })
  const verifyUrl = `https://commrent.kz/verify/${doc.id}`

  // Счёт подписывает только поставщик (арендодатель).
  if (doc.documentType === "INVOICE") {
    return renderInvoiceDocx(doc.sourceState as InvoiceState, { verifyUrl, sellerSigner: stampOf(sigs[0]) })
  }

  // АВР — двусторонний: сопоставляем подписи Исполнителю/Заказчику по ИИН/БИН.
  const avr = doc.sourceState as AvrState
  const execIds = [digits(avr.executor?.binIin)].filter((x) => x.length === 12)
  const custIds = [digits(avr.customer?.binIin)].filter((x) => x.length === 12)
  let executorSigner: SignStamp | undefined
  let customerSigner: SignStamp | undefined
  for (const s of sigs) {
    const ids = [digits(s.signerOrgBin), digits(s.signerIin)].filter((x) => x.length === 12)
    if (ids.some((i) => custIds.includes(i))) customerSigner = stampOf(s)
    else if (ids.some((i) => execIds.includes(i))) executorSigner = stampOf(s)
    else if (!executorSigner) executorSigner = stampOf(s) // не сматчилось → исполнитель (арендодатель подписывает со своей стороны)
  }
  return renderAvrDocx(avr, { verifyUrl, executorSigner, customerSigner })
}
