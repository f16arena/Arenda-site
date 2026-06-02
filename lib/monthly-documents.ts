// Авто-генерация ежемесячных документов (Вариант C). Счёт на оплату формируется
// сам после начислений и сразу виден арендатору в кабинете (= авто-отправка) +
// уведомление. ЭЦП для счёта не нужна. АВР подписывается владельцем отдельно
// (батч-экран) — здесь не трогаем.
//
// Идемпотентно: если за (арендатор, период) счёт уже есть — пропускаем.

import { db } from "@/lib/db"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { type InvoicePartyType, type InvoiceItem, defaultInvoiceState, invTotal } from "@/lib/invoice-engine"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"

const CHARGE_TYPE_LABEL: Record<string, string> = {
  RENT: "Аренда нежилого помещения",
  CLEANING: "Уборка помещения",
  SERVICE_FEE: "Эксплуатационные расходы",
  SERVICE_FEE_INDEXED: "Эксплуатационные расходы (с индексацией)",
  SERVICE_DELIVERED: "Оказанные услуги",
  PENALTY: "Пеня",
  DEPOSIT: "Гарантийный взнос (депозит)",
  OTHER: "Прочие услуги",
}

function toPartyType(legalType: string | null | undefined): InvoicePartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  return "too"
}

export type MonthlyInvoiceResult = { created: number; skipped: number; notified: number }

/** Генерирует счета за период для всех арендаторов организации с начислениями. */
export async function generateMonthlyInvoicesForOrg(orgId: string, period: string): Promise<MonthlyInvoiceResult> {
  const res: MonthlyInvoiceResult = { created: 0, skipped: 0, notified: 0 }
  if (!/^\d{4}-\d{2}$/.test(period)) return res

  const organization = await db.organization.findUnique({
    where: { id: orgId },
    select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true },
  })
  if (!organization) return res
  const req = organizationToRequisites(organization)

  // Арендаторы организации, у которых есть начисления за период.
  const tenants = await db.tenant.findMany({
    where: { user: { organizationId: orgId }, charges: { some: { period } } },
    select: {
      id: true, userId: true, companyName: true, legalType: true, bin: true, iin: true,
      legalAddress: true, actualAddress: true,
      bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { bankName: true, iik: true, bik: true, isPrimary: true } },
      charges: { where: { period }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true } },
      contracts: { orderBy: { createdAt: "desc" }, take: 1, select: { number: true, startDate: true } },
    },
  })
  if (tenants.length === 0) return res

  // Уже выставленные счета за период — для идемпотентности.
  const existing = await db.generatedDocument.findMany({
    where: { organizationId: orgId, documentType: "INVOICE", period },
    select: { tenantId: true },
  })
  const alreadyInvoiced = new Set(existing.map((d) => d.tenantId).filter(Boolean) as string[])

  // Текущий максимум номера счёта (как в computeNextInvoiceNumber).
  const numberRows = await db.generatedDocument.findMany({ where: { organizationId: orgId, documentType: "INVOICE" }, select: { number: true } })
  let maxNum = 0
  for (const r of numberRows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (n > maxNum) maxNum = n }
  }

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  for (const tenant of tenants) {
    if (alreadyInvoiced.has(tenant.id)) { res.skipped++; continue }

    const number = String(++maxNum).padStart(3, "0")
    const s = defaultInvoiceState()
    s.period = period
    s.meta.number = number
    s.meta.date = today

    s.seller = {
      type: toPartyType(req.legalType),
      name: req.fullName,
      binIin: req.taxId || req.bin || req.iin,
      address: req.legalAddress,
      bank: req.bank, iik: req.iik, bik: req.bik, kbe: req.kbe, knp: req.knp,
      signatory: req.directorShort || req.director,
      signatoryPosition: req.directorPosition || "Директор",
    }
    const tb = tenant.bankAccounts.find((b) => b.isPrimary) ?? tenant.bankAccounts[0]
    s.buyer = {
      type: toPartyType(tenant.legalType),
      name: tenant.companyName,
      binIin: tenant.bin || tenant.iin || "",
      address: tenant.legalAddress || tenant.actualAddress || "",
      bank: tb?.bankName ?? "", iik: tb?.iik ?? "", bik: tb?.bik ?? "",
    }
    const contract = tenant.contracts[0]
    if (contract) {
      s.contractRef.number = contract.number
      if (contract.startDate) s.contractRef.date = new Date(contract.startDate).toISOString().slice(0, 10)
    }
    const items: InvoiceItem[] = tenant.charges.map((c) => ({
      name: c.description || CHARGE_TYPE_LABEL[c.type] || c.type, unit: "услуга", qty: 1, price: Math.round(c.amount),
    }))
    if (items.length === 0) continue // нет позиций — пропускаем (страховка)
    s.items = items
    s.vat = { enabled: !!organization.isVatPayer, rate: coerceKzVatRate(organization.vatRate, DEFAULT_KZ_VAT_RATE) }

    const total = invTotal(s)
    const buf = await renderInvoiceDocx(s)
    const fileName = `Счёт_${number}_${period}.docx`

    await db.generatedDocument.create({
      data: {
        organizationId: orgId,
        documentType: "INVOICE",
        number,
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        period,
        totalAmount: total,
        fileName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fileBytes: buf as any,
        fileSize: buf.length,
        format: "DOCX",
      },
    })
    res.created++

    // Уведомляем арендатора — счёт уже виден в кабинете.
    try {
      await db.notification.create({
        data: {
          userId: tenant.userId,
          type: "DOCUMENT",
          title: `Счёт на оплату за ${period}`,
          message: `Выставлен счёт № ${number} на сумму ${Math.round(total).toLocaleString("ru-RU")} ₸. Документ доступен в кабинете.`,
          link: "/cabinet/documents",
        },
      })
      res.notified++
    } catch { /* уведомление — best-effort */ }
  }

  return res
}
