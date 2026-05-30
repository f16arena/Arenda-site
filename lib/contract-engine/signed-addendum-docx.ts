import "server-only"
import { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun } from "docx"
import QRCode from "qrcode"
import { db } from "@/lib/db"
import { getOrganizationRequisites } from "@/lib/organization-requisites"

interface AddendumRow {
  id: string
  number: string | null
  content: string
  signedByLandlordAt: Date | null
  signedByTenantAt: Date | null
  tenant: { companyName: string; bin: string | null; iin: string | null; user: { organizationId: string | null } }
}

const digits = (v?: string | null) => String(v ?? "").replace(/\D/g, "")
const fmtDt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined

interface Stamp { name: string; taxId?: string; signedAt?: string; tspTime?: string; ecp: boolean }

/** Блок подписи стороны: штамп ЭЦП (если подписано) либо строка «___ /ФИО/ М.П.». */
function partyBlock(role: string, name: string, stamp: Stamp | null): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: `${role}:`, bold: true, size: 22 })], spacing: { before: 160, after: 20 } }),
    new Paragraph({ children: [new TextRun({ text: name || "________", size: 22 })], spacing: { after: 20 } }),
  ]
  if (stamp) {
    out.push(new Paragraph({ children: [new TextRun({ text: "✔ " + (stamp.ecp ? "Документ подписан ЭЦП (НУЦ РК)" : "Документ подписан (электронно)"), bold: true, size: 18, color: "1A7F37" })], spacing: { after: 16 } }))
    out.push(new Paragraph({ children: [new TextRun({ text: `${stamp.name}${stamp.taxId ? `, ИИН/БИН ${stamp.taxId}` : ""}`, size: 16, color: "444444" })], spacing: { after: 8 } }))
    if (stamp.signedAt) out.push(new Paragraph({ children: [new TextRun({ text: `Время подписания: ${stamp.signedAt}`, size: 16, color: "444444" })], spacing: { after: 8 } }))
    if (stamp.tspTime) out.push(new Paragraph({ children: [new TextRun({ text: `Метка времени (TSP, НУЦ РК): ${stamp.tspTime}`, size: 16, color: "444444" })] }))
  } else {
    out.push(new Paragraph({ children: [new TextRun({ text: "_______________ /________/ М.П.", size: 20 })] }))
  }
  return out
}

/**
 * Рендерит подписанное доп. соглашение (текст из contract.content) в DOCX со
 * штампами ЭЦП обеих сторон и QR на /verify. Для ДС нет builderState — рендерим текст.
 */
export async function buildSignedAddendumDocxBuffer(c: AddendumRow): Promise<Buffer> {
  const orgId = c.tenant.user.organizationId
  const org = orgId ? await getOrganizationRequisites(orgId).catch(() => null) : null

  const sigs = await db.documentSignature.findMany({
    where: { documentType: "CONTRACT", documentId: c.id },
    select: { signerName: true, signerIin: true, signerOrgBin: true, signedAt: true, algorithm: true, tspGenTime: true },
    orderBy: { signedAt: "asc" },
  })
  const landlordIds = [digits(org?.bin), digits(org?.iin), digits(org?.taxId)].filter((x) => x.length === 12)
  const tenantIds = [digits(c.tenant.bin), digits(c.tenant.iin)].filter((x) => x.length === 12)
  const isEcp = (alg?: string) => !!alg && /ЭЦП|NCALayer|ГОСТ|RSA/i.test(alg)

  let landlordStamp: Stamp | null = null
  let tenantStamp: Stamp | null = null
  for (const s of sigs) {
    const tax = digits(s.signerOrgBin) || digits(s.signerIin)
    const stamp: Stamp = { name: s.signerName, taxId: tax || undefined, signedAt: fmtDt(s.signedAt), tspTime: fmtDt(s.tspGenTime), ecp: isEcp(s.algorithm) }
    if (tax && landlordIds.includes(tax)) landlordStamp = stamp
    else if (tax && tenantIds.includes(tax)) tenantStamp = stamp
  }
  if (!landlordStamp && c.signedByLandlordAt) landlordStamp = { name: org?.director || org?.fullName || "Арендодатель", taxId: org?.bin || org?.iin || undefined, signedAt: fmtDt(c.signedByLandlordAt), ecp: false }
  if (!tenantStamp && c.signedByTenantAt) tenantStamp = { name: c.tenant.companyName, taxId: c.tenant.bin || c.tenant.iin || undefined, signedAt: fmtDt(c.signedByTenantAt), ecp: false }

  // Текст ДС → абзацы. Первая строка — заголовок (жирный, по центру), вторая — подзаголовок.
  const lines = (c.content || "").split("\n")
  const body: Paragraph[] = lines.map((line, i) => {
    if (i === 0) return new Paragraph({ children: [new TextRun({ text: line, bold: true, size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 40 } })
    if (i === 1) return new Paragraph({ children: [new TextRun({ text: line, size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 120 } })
    if (line.trim() === "") return new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } })
    return new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 60 } })
  })

  const qr = await QRCode.toBuffer(`https://commrent.kz/verify/${c.id}`, { width: 200, margin: 1, errorCorrectionLevel: "M" })

  const children: Paragraph[] = [
    ...body,
    new Paragraph({ children: [new TextRun({ text: "Подписи Сторон:", bold: true, size: 22 })], spacing: { before: 240, after: 40 } }),
    ...partyBlock("АРЕНДОДАТЕЛЬ", org?.fullName ?? "", landlordStamp),
    ...partyBlock("АРЕНДАТОР", c.tenant.companyName, tenantStamp),
    new Paragraph({
      children: [new ImageRun({ type: "png", data: qr, transformation: { width: 110, height: 110 } })],
      spacing: { before: 200 },
    }),
    new Paragraph({ children: [new TextRun({ text: `Проверка подлинности: https://commrent.kz/verify/${c.id}`, size: 16, color: "666666" })] }),
  ]

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
