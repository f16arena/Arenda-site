import "server-only"
import { db } from "@/lib/db"
import { renderContractDocx, type DocxSigners } from "./docx"
import type { ContractState } from "./schema"

interface SignedContractRow {
  id: string
  number: string | null
  builderState: unknown
  signedByLandlordAt: Date | null
  signedByTenantAt: Date | null
}

/**
 * Рендерит подписанный договор в DOCX со штампами ЭЦП (по реальным DocumentSignature
 * + TSP-меткам). Общая логика для админского скачивания и публичного по токену.
 * Возвращает null, если у договора нет builderState (например, ДС из текста).
 */
export async function buildSignedContractDocxBuffer(c: SignedContractRow): Promise<Buffer | null> {
  if (!c.builderState) return null
  const state = c.builderState as unknown as ContractState

  const sigs = await db.documentSignature.findMany({
    where: { documentType: "CONTRACT", documentId: c.id },
    select: { signerName: true, signerIin: true, signerOrgBin: true, signedAt: true, algorithm: true, tspGenTime: true },
    orderBy: { signedAt: "asc" },
  })
  const digits = (v?: string | null) => String(v ?? "").replace(/\D/g, "")
  const fmtDt = (d: Date | null | undefined) => d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined
  const landlordIds = [digits(state.landlord.bin), digits(state.landlord.iin)].filter((x) => x.length === 12)
  const tenantIds = [digits(state.tenant.bin), digits(state.tenant.iin)].filter((x) => x.length === 12)
  const isEcp = (alg?: string) => !!alg && /ЭЦП|NCALayer|ГОСТ|RSA/i.test(alg)
  const signers: DocxSigners = {}
  for (const sg of sigs) {
    const tax = digits(sg.signerOrgBin) || digits(sg.signerIin)
    const stamp = { name: sg.signerName, taxId: tax || undefined, signedAt: fmtDt(sg.signedAt), tspTime: fmtDt(sg.tspGenTime), method: isEcp(sg.algorithm) ? "Документ подписан ЭЦП (НУЦ РК)" : "Документ подписан (простая подпись)" }
    if (tax && landlordIds.includes(tax)) signers.landlord = stamp
    else if (tax && tenantIds.includes(tax)) signers.tenant = stamp
  }
  // Простая отметка («Подписать и отправить») без DocumentSignature — штамп по факту.
  if (!signers.landlord && c.signedByLandlordAt) signers.landlord = { name: state.landlord.signatory || state.landlord.name, taxId: state.landlord.bin || state.landlord.iin || undefined, signedAt: fmtDt(c.signedByLandlordAt), method: "Документ подписан (электронно)" }
  if (!signers.tenant && c.signedByTenantAt) signers.tenant = { name: state.tenant.signatory || state.tenant.name, taxId: state.tenant.bin || state.tenant.iin || undefined, signedAt: fmtDt(c.signedByTenantAt), method: "Документ подписан (электронно)" }

  const verifyUrl = `https://commrent.kz/verify/${c.id}`
  return renderContractDocx(state, { verifyUrl, signers })
}
