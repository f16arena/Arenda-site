import "server-only"
import { db } from "@/lib/db"
import { renderInvoiceDocx } from "@/lib/invoice-engine/docx"
import { renderAvrDocx } from "@/lib/avr-engine/docx"
import { invTotal, type InvoiceState } from "@/lib/invoice-engine"
import { avrTotal, type AvrState } from "@/lib/avr-engine"
import { buildInvoiceStateForTenant } from "@/lib/invoice-engine/prefill"
import { buildAvrStateForTenant } from "@/lib/avr-engine/prefill"
import { nextDocumentNumber } from "@/lib/document-number"
import { notifyUser } from "@/lib/notify"

/**
 * Конвейер «договор подписан → документы готовы»: после перехода договора в
 * SIGNED автоматически создаются Счёт на оплату и АВР за текущий месяц
 * (позиции из договора: аренда + эксплуатационные расходы + услуги) и кладутся
 * в «Документы». Владелец получает уведомление «проверьте и подпишите» —
 * после его подписи документ автоматически уходит арендатору
 * (см. lib/document-delivery.ts).
 *
 * Идемпотентно: документ типа (арендатор × период) не дублируется.
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

    // Авто/ручной режим по тарифу: автосоздание документов — только для планов
    // с флагом autoInvoiceCron (как и месячный авто-биллинг). На остальных тарифах
    // счёт и АВР создаются вручную через конструкторы.
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { plan: { select: { features: true } } },
    })
    let autoMode = false
    try {
      autoMode = JSON.parse(org?.plan?.features ?? "{}")?.flags?.autoInvoiceCron === true
        || JSON.parse(org?.plan?.features ?? "{}")?.autoInvoiceCron === true
    } catch { /* нет флага — ручной режим */ }
    if (!autoMode) return

    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const created: string[] = []

    // Счёт на оплату
    const hasInvoice = await db.generatedDocument.findFirst({
      where: { organizationId: orgId, documentType: "INVOICE", tenantId: contract.tenantId, period },
      select: { id: true },
    })
    if (!hasInvoice) {
      const r = await buildInvoiceStateForTenant(orgId, contract.tenantId, period)
      if (r.ok) {
        const number = await nextDocumentNumber(orgId, "INVOICE")
        const state: InvoiceState = { ...r.state, meta: { ...r.state.meta, number } }
        const buf = await renderInvoiceDocx(state)
        await db.generatedDocument.create({
          data: {
            organizationId: orgId,
            documentType: "INVOICE",
            number,
            tenantId: contract.tenantId,
            tenantName: contract.tenant.companyName,
            period,
            totalAmount: invTotal(state),
            fileName: `Счёт_${number}_${period}.docx`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fileBytes: buf as any,
            fileSize: buf.length,
            format: "DOCX",
            generatedById: null,
          },
        })
        created.push(`Счёт на оплату № ${number}`)
      } else {
        console.warn("[auto-documents] счёт не создан:", r.error)
      }
    }

    // АВР (форма Р-1)
    const hasAct = await db.generatedDocument.findFirst({
      where: { organizationId: orgId, documentType: "ACT", tenantId: contract.tenantId, period },
      select: { id: true },
    })
    if (!hasAct) {
      const r = await buildAvrStateForTenant(orgId, contract.tenantId, period)
      if (r.ok) {
        const number = await nextDocumentNumber(orgId, "ACT")
        const state: AvrState = { ...r.state, meta: { ...r.state.meta, number } }
        const buf = await renderAvrDocx(state)
        await db.generatedDocument.create({
          data: {
            organizationId: orgId,
            documentType: "ACT",
            number,
            tenantId: contract.tenantId,
            tenantName: contract.tenant.companyName,
            period,
            totalAmount: avrTotal(state),
            fileName: `АВР_${number}_${period}.docx`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fileBytes: buf as any,
            fileSize: buf.length,
            format: "DOCX",
            generatedById: null,
          },
        })
        created.push(`АВР № ${number}`)
      } else {
        console.warn("[auto-documents] АВР не создан:", r.error)
      }
    }

    // Владельцу — «на подпись»: после его подписи документ уйдёт арендатору.
    if (created.length > 0) {
      const org = await db.organization.findUnique({ where: { id: orgId }, select: { ownerUserId: true } })
      if (org?.ownerUserId) {
        await notifyUser({
          userId: org.ownerUserId,
          type: "DOCUMENT_SIGN_REQUEST",
          title: "Документы по договору готовы — подпишите",
          message: `По договору с «${contract.tenant.companyName}» автоматически созданы: ${created.join(", ")} за ${period}. Проверьте и подпишите в разделе «Документы» — после подписи они автоматически уйдут арендатору.`,
          link: "/admin/documents",
          sendEmail: false,
        }).catch(() => {})
      }
    }
  } catch (e) {
    console.warn("[auto-documents] ошибка:", e instanceof Error ? e.message : e)
  }
}
