"use server"

import { db } from "@/lib/db"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { type InvoiceState, type InvoicePartyType, type InvoiceItem, defaultInvoiceState, invTotal } from "@/lib/invoice-engine"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"

function toPartyType(legalType: string | null | undefined): InvoicePartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  return "too"
}

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

async function computeNextInvoiceNumber(orgId: string): Promise<string> {
  const rows = await db.generatedDocument.findMany({ where: { organizationId: orgId, documentType: "INVOICE" }, select: { number: true } })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (n > max) max = n }
  }
  return String(max + 1).padStart(3, "0")
}

export async function getNextInvoiceNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    return { ok: true, number: await computeNextInvoiceNumber(orgId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить номер" }
  }
}

export async function prefillInvoiceFromTenant(
  tenantId: string,
  period: string,
): Promise<{ ok: boolean; error?: string; state?: InvoiceState }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Укажите период (месяц)" }

    const [tenant, organization] = await Promise.all([
      db.tenant.findFirst({
        where: { AND: [tenantScope(orgId), { id: tenantId }] },
        select: {
          companyName: true, legalType: true, bin: true, iin: true, legalAddress: true, actualAddress: true,
          bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { bankName: true, iik: true, bik: true, isPrimary: true } },
          charges: { where: { period }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true } },
          contracts: { orderBy: { createdAt: "desc" }, take: 1, select: { number: true, startDate: true } },
        },
      }),
      db.organization.findUnique({ where: { id: orgId }, select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true } }),
    ])
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    const req = organizationToRequisites(organization)
    const s = defaultInvoiceState()
    s.period = period
    const now = new Date()
    s.meta.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

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

    const items: InvoiceItem[] = []
    for (const c of tenant.charges) {
      items.push({ name: c.description || CHARGE_TYPE_LABEL[c.type] || c.type, unit: "услуга", qty: 1, price: Math.round(c.amount) })
    }
    if (items.length === 0) items.push({ name: `Аренда нежилого помещения за ${period}`, unit: "мес", qty: 1, price: 0 })
    s.items = items

    s.vat = { enabled: !!organization?.isVatPayer, rate: coerceKzVatRate(organization?.vatRate, DEFAULT_KZ_VAT_RATE) }

    return { ok: true, state: s }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить данные" }
  }
}

export async function generateInvoiceDocx(state: InvoiceState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()
    const buf = await renderInvoiceDocx(state)
    const num = (state.meta.number || "").trim() || "счёт"
    return { ok: true, base64: buf.toString("base64"), fileName: `Счёт_${num}_${state.period || ""}.docx` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации" }
  }
}

/** Счёт строго в PDF (DOCX → конвертер на VPS). */
export async function generateInvoicePdf(state: InvoiceState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()
    if (!pdfConvertConfigured()) return { ok: false, error: "PDF-конвертер не настроен (PDF_CONVERT_URL/SECRET)." }
    const buf = await renderInvoiceDocx(state)
    const num = (state.meta.number || "").trim() || "счёт"
    const pdf = await convertDocxToPdf(buf, `Счёт_${num}.docx`)
    return { ok: true, base64: pdf.toString("base64"), fileName: `Счёт_${num}_${state.period || ""}.pdf` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации PDF" }
  }
}

export async function createInvoiceFromBuilder(
  tenantId: string,
  state: InvoiceState,
  opts?: { autoNumber?: boolean },
): Promise<{ ok: boolean; error?: string; documentId?: string; number?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const session = await auth()
    if (!tenantId) return { ok: false, error: "Сначала выберите арендатора" }

    const tenant = await db.tenant.findFirst({ where: { AND: [tenantScope(orgId), { id: tenantId }] }, select: { id: true, companyName: true } })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }
    if (state.items.length === 0) return { ok: false, error: "Добавьте хотя бы одну позицию" }

    // Защита от дубля: один счёт на (арендатор × период).
    if (state.period && /^\d{4}-\d{2}$/.test(state.period)) {
      const dup = await db.generatedDocument.findFirst({
        where: { organizationId: orgId, documentType: "INVOICE", tenantId: tenant.id, period: state.period },
        select: { number: true },
      })
      if (dup) return { ok: false, error: `За период ${state.period} счёт № ${dup.number} уже создан. Чтобы пересоздать — удалите старый в разделе «Документы».` }
    }

    const number = opts?.autoNumber ? await computeNextInvoiceNumber(orgId) : (state.meta.number || "").trim() || "Б/Н"
    const finalState: InvoiceState = { ...state, meta: { ...state.meta, number } }
    const buf = await renderInvoiceDocx(finalState)
    const total = invTotal(finalState)
    const fileName = `Счёт_${number}_${state.period || ""}.docx`

    const doc = await db.generatedDocument.create({
      data: {
        organizationId: orgId,
        documentType: "INVOICE",
        number,
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        period: state.period || null,
        totalAmount: total,
        fileName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fileBytes: buf as any,
        fileSize: buf.length,
        format: "DOCX",
        generatedById: session?.user.id ?? null,
      },
      select: { id: true },
    })
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${tenant.id}`)
    return { ok: true, documentId: doc.id, number }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать счёт" }
  }
}
