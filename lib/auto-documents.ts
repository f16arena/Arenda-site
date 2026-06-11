import "server-only"
import { db } from "@/lib/db"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"
import { renderAvrDocx } from "@/lib/avr-engine/docx"
import { invTotal, type InvoiceState } from "@/lib/invoice-engine"
import { avrTotal, type AvrState } from "@/lib/avr-engine"
import { buildInvoiceStateForTenant } from "@/lib/invoice-engine/prefill"
import { buildAvrStateForTenant } from "@/lib/avr-engine/prefill"
import { nextDocumentNumber } from "@/lib/document-number"
import { getActiveContractForTenant } from "@/lib/active-contract"
import { notifyUser } from "@/lib/notify"

/**
 * Конвейер «договор подписан → документы готовы»:
 *  - при переходе договора в SIGNED создаётся СЧЁТ на оплату за текущий месяц
 *    (аренда платится вперёд) и кладётся владельцу на подпись;
 *  - АВР создаётся в КОНЦЕ месяца кроном monthly-acts (акт об оказанных
 *    услугах оформляется по факту, датируется последним днём месяца).
 * После подписи владельцем документ автоматически уходит арендатору
 * (см. lib/document-delivery.ts).
 *
 * Идемпотентно: документ типа (арендатор × период) не дублируется.
 */

/** Авто-режим по тарифу: флаг autoInvoiceCron в Plan.features */
export async function orgHasAutoDocuments(orgId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { features: true } } },
  })
  try {
    const f = JSON.parse(org?.plan?.features ?? "{}")
    return f?.flags?.autoInvoiceCron === true || f?.autoInvoiceCron === true
  } catch {
    return false
  }
}

/** Создать счёт на оплату за период (если ещё нет). Возвращает подпись документа или null. */
export async function createInvoiceForTenant(
  orgId: string,
  tenantId: string,
  tenantName: string,
  period: string,
): Promise<string | null> {
  const exists = await db.generatedDocument.findFirst({
    where: { organizationId: orgId, documentType: "INVOICE", tenantId, period },
    select: { id: true },
  })
  if (exists) return null
  const r = await buildInvoiceStateForTenant(orgId, tenantId, period)
  if (!r.ok) {
    console.warn("[auto-documents] счёт не создан:", r.error)
    return null
  }
  const contract = await getActiveContractForTenant(tenantId)
  const number = await nextDocumentNumber(orgId, "INVOICE")
  const state: InvoiceState = { ...r.state, meta: { ...r.state.meta, number } }
  const buf = await renderInvoiceDocx(state)
  await db.generatedDocument.create({
    data: {
      organizationId: orgId,
      documentType: "INVOICE",
      number,
      tenantId,
      tenantName,
      period,
      contractId: contract?.id ?? null,
      totalAmount: invTotal(state),
      fileName: `Счёт_${number}_${period}.docx`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fileBytes: buf as any,
      fileSize: buf.length,
      format: "DOCX",
      generatedById: null,
    },
  })
  return `Счёт на оплату № ${number}`
}

/** Создать АВР (форма Р-1) за период (если ещё нет). Возвращает подпись документа или null. */
export async function createActForTenant(
  orgId: string,
  tenantId: string,
  tenantName: string,
  period: string,
): Promise<string | null> {
  const exists = await db.generatedDocument.findFirst({
    where: { organizationId: orgId, documentType: "ACT", tenantId, period },
    select: { id: true },
  })
  if (exists) return null
  const r = await buildAvrStateForTenant(orgId, tenantId, period)
  if (!r.ok) {
    console.warn("[auto-documents] АВР не создан:", r.error)
    return null
  }
  const contract = await getActiveContractForTenant(tenantId)
  const number = await nextDocumentNumber(orgId, "ACT")
  const state: AvrState = { ...r.state, meta: { ...r.state.meta, number } }
  const buf = await renderAvrDocx(state)
  await db.generatedDocument.create({
    data: {
      organizationId: orgId,
      documentType: "ACT",
      number,
      tenantId,
      tenantName,
      period,
      contractId: contract?.id ?? null,
      totalAmount: avrTotal(state),
      fileName: `АВР_${number}_${period}.docx`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fileBytes: buf as any,
      fileSize: buf.length,
      format: "DOCX",
      generatedById: null,
    },
  })
  return `АВР № ${number}`
}

/** Уведомить владельца: документы готовы, подпишите. */
async function notifyOwnerToSign(orgId: string, message: string): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { ownerUserId: true } })
  if (!org?.ownerUserId) return
  await notifyUser({
    userId: org.ownerUserId,
    type: "DOCUMENT_SIGN_REQUEST",
    title: "Документы готовы — подпишите",
    message,
    link: "/admin/documents",
    sendEmail: false,
  }).catch(() => {})
}

/**
 * При подписании договора: счёт на оплату за текущий месяц.
 * АВР здесь сознательно НЕ создаётся — его сформирует крон в конце месяца.
 * Никогда не бросает — подписание договора уже состоялось.
 */
export async function autoCreateDocumentsForSignedContract(contractId: string): Promise<void> {
  try {
    const contract = await db.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: {
        id: true,
        status: true,
        type: true,
        tenantId: true,
        tenant: { select: { companyName: true, user: { select: { organizationId: true } } } },
      },
    })
    if (!contract || contract.status !== "SIGNED" || contract.type === "ADDENDUM") return
    const orgId = contract.tenant.user.organizationId
    if (!orgId) return

    // Авто/ручной режим по тарифу: на остальных тарифах — конструкторы вручную.
    if (!(await orgHasAutoDocuments(orgId))) return

    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const created = await createInvoiceForTenant(orgId, contract.tenantId, contract.tenant.companyName, period)

    if (created) {
      await notifyOwnerToSign(
        orgId,
        `По договору с «${contract.tenant.companyName}» автоматически создан ${created} за ${period}. Проверьте и подпишите в разделе «Документы» — после подписи он автоматически уйдёт арендатору. АВР сформируется в конце месяца.`,
      )
    }
  } catch (e) {
    console.warn("[auto-documents] ошибка:", e instanceof Error ? e.message : e)
  }
}

/**
 * Конец месяца: АВР за период по всем арендаторам организации с подписанными
 * договорами (вызывается кроном monthly-acts в последний день месяца).
 */
export async function autoCreateActsForPeriod(orgId: string, period: string): Promise<{ created: number; skipped: number }> {
  const contracts = await db.contract.findMany({
    where: {
      deletedAt: null,
      status: "SIGNED",
      type: { not: "ADDENDUM" },
      tenant: { user: { organizationId: orgId } },
    },
    select: { tenantId: true, tenant: { select: { companyName: true } } },
    orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
  })
  const seen = new Set<string>()
  let created = 0
  let skipped = 0
  const names: string[] = []
  for (const c of contracts) {
    if (seen.has(c.tenantId)) continue
    seen.add(c.tenantId)
    const label = await createActForTenant(orgId, c.tenantId, c.tenant.companyName, period)
    if (label) {
      created++
      names.push(c.tenant.companyName)
    } else {
      skipped++
    }
  }
  if (created > 0) {
    await notifyOwnerToSign(
      orgId,
      `Сформированы АВР за ${period}: ${created} шт (${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}). Подпишите в разделе «Документы» — после подписи они автоматически уйдут арендаторам.`,
    )
  }
  return { created, skipped }
}
