"use server"

import { db } from "@/lib/db"
import { getT } from "@/lib/i18n/server"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { type InvoiceState, invTotal } from "@/lib/invoice-engine"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"
import { buildInvoiceStateForTenant } from "@/lib/invoice-engine/prefill"
import { nextDocumentNumber } from "@/lib/document-number"
import { getActiveContractForTenant, NO_ACTIVE_CONTRACT_ERROR } from "@/lib/active-contract"

const computeNextInvoiceNumber = (orgId: string) => nextDocumentNumber(orgId, "INVOICE")

export async function getNextInvoiceNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    return { ok: true, number: await computeNextInvoiceNumber(orgId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.docBuilders.numberFailed") }
  }
}

export async function prefillInvoiceFromTenant(
  tenantId: string,
  period: string,
): Promise<{ ok: boolean; error?: string; state?: InvoiceState; source?: "charges" | "contract" }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    // Вся сборка (включая правило действующего договора и позиции из договора) —
    // в lib/invoice-engine/prefill, общая с автогенерацией при подписании.
    return await buildInvoiceStateForTenant(orgId, tenantId, period)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.docBuilders.loadFailed") }
  }
}

export async function generateInvoiceDocx(state: InvoiceState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    await requireOrgAccess()
    const buf = await renderInvoiceDocx(state)
    const num = (state.meta.number || "").trim() || "счёт"
    return { ok: true, base64: buf.toString("base64"), fileName: t("actions.invoiceBuilder.fileNamePeriod", { number: num, period: state.period ?? "" }) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.docBuilders.generateFailed") }
  }
}

/** Счёт строго в PDF (DOCX → конвертер на VPS). */
export async function generateInvoicePdf(state: InvoiceState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    await requireOrgAccess()
    if (!pdfConvertConfigured()) return { ok: false, error: t("actions.docBuilders.pdfConverterMissing") }
    const buf = await renderInvoiceDocx(state)
    const num = (state.meta.number || "").trim() || "счёт"
    const pdf = await convertDocxToPdf(buf, `Счёт_${num}.docx`)
    return { ok: true, base64: pdf.toString("base64"), fileName: t("actions.invoiceBuilder.fileNamePdf", { number: num, period: state.period ?? "" }) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.docBuilders.pdfGenerateFailed") }
  }
}

export async function createInvoiceFromBuilder(
  tenantId: string,
  state: InvoiceState,
  opts?: { autoNumber?: boolean },
): Promise<{ ok: boolean; error?: string; documentId?: string; number?: string }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    const session = await auth()
    if (!tenantId) return { ok: false, error: t("actions.docBuilders.pickTenantFirst") }

    const tenant = await db.tenant.findFirst({ where: { AND: [tenantScope(orgId), { id: tenantId }] }, select: { id: true, companyName: true } })
    if (!tenant) return { ok: false, error: t("actions.docBuilders.tenantNotFoundOrNoAccess") }
    if (state.items.length === 0) return { ok: false, error: t("actions.invoiceBuilder.needItems") }

    // Правило: счёт создаётся только контрагенту с действующим договором.
    const activeContract = await getActiveContractForTenant(tenant.id)
    if (!activeContract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

    // Защита от дубля: один счёт на (арендатор × период).
    if (state.period && /^\d{4}-\d{2}$/.test(state.period)) {
      const dup = await db.generatedDocument.findFirst({
        where: { organizationId: orgId, documentType: "INVOICE", tenantId: tenant.id, period: state.period },
        select: { number: true },
      })
      if (dup) return { ok: false, error: t("actions.invoiceBuilder.duplicate", { period: state.period ?? "", number: dup.number ?? "" }) }
    }

    const number = opts?.autoNumber ? await computeNextInvoiceNumber(orgId) : (state.meta.number || "").trim() || t("actions.docBuilders.noNumber")
    const finalState: InvoiceState = { ...state, meta: { ...state.meta, number } }
    const buf = await renderInvoiceDocx(finalState)
    const total = invTotal(finalState)
    const fileName = t("actions.invoiceBuilder.fileNamePeriod", {
      number,
      period: state.period ?? "",
    })

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sourceState: finalState as any,
        generatedById: session?.user.id ?? null,
      },
      select: { id: true },
    })
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${tenant.id}`)
    return { ok: true, documentId: doc.id, number }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.invoiceBuilder.createFailed") }
  }
}
