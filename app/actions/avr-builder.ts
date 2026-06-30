"use server"

import { db } from "@/lib/db"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { type AvrState, avrTotal } from "@/lib/avr-engine"
import { renderAvrDocx } from "@/lib/avr-engine/docx"
import { buildAvrStateForTenant } from "@/lib/avr-engine/prefill"
import { nextDocumentNumber } from "@/lib/document-number"
import { notifyUser } from "@/lib/notify"
import { getActiveContractForTenant, NO_ACTIVE_CONTRACT_ERROR } from "@/lib/active-contract"

const computeNextActNumber = (orgId: string) => nextDocumentNumber(orgId, "ACT")

export async function getNextActNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    return { ok: true, number: await computeNextActNumber(orgId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить номер" }
  }
}

/**
 * Собирает AvrState из арендатора и периода (YYYY-MM): Исполнитель = организация,
 * Заказчик = арендатор, договор из последнего контракта, строки — из начислений за
 * месяц (Charge); НДС — из настроек организации. Если начислений нет — одна строка
 * «Аренда за период».
 */
export async function prefillAvrFromTenant(
  tenantId: string,
  period: string,
): Promise<{ ok: boolean; error?: string; state?: AvrState; source?: "charges" | "contract" }> {
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    // Вся сборка (включая правило действующего договора и строки из договора) —
    // в lib/avr-engine/prefill, общая с автогенерацией при подписании.
    return await buildAvrStateForTenant(orgId, tenantId, period)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить данные" }
  }
}

/** Генерирует DOCX акта (base64) для скачивания/предпросмотра без сохранения. */
export async function generateAvrDocx(state: AvrState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.create")
    await requireOrgAccess()
    const buf = await renderAvrDocx(state)
    const num = (state.meta.number || "").trim() || "акт"
    return { ok: true, base64: buf.toString("base64"), fileName: `АВР_${num}_${state.period || ""}.docx` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации" }
  }
}

/** АВР строго в PDF (DOCX → конвертер на VPS). Word наружу не отдаём. */
export async function generateAvrPdf(state: AvrState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.create")
    await requireOrgAccess()
    if (!pdfConvertConfigured()) return { ok: false, error: "PDF-конвертер не настроен (PDF_CONVERT_URL/SECRET)." }
    const buf = await renderAvrDocx(state)
    const num = (state.meta.number || "").trim() || "акт"
    const pdf = await convertDocxToPdf(buf, `АВР_${num}.docx`)
    return { ok: true, base64: pdf.toString("base64"), fileName: `АВР_${num}_${state.period || ""}.pdf` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации PDF" }
  }
}

/**
 * Создаёт АВР: генерирует DOCX (форма Р-1) и сохраняет в архив документов
 * (GeneratedDocument, тип ACT). Номер — автонумерация или ручной.
 */
export async function createAvrFromBuilder(
  tenantId: string,
  state: AvrState,
  opts?: { autoNumber?: boolean; requestSignature?: boolean },
): Promise<{ ok: boolean; error?: string; documentId?: string; number?: string }> {
  try {
    await requireCapabilityAndFeature("documents.create")
    const { orgId } = await requireOrgAccess()
    const session = await auth()
    if (!tenantId) return { ok: false, error: "Сначала выберите арендатора" }

    const tenant = await db.tenant.findFirst({ where: { AND: [tenantScope(orgId), { id: tenantId }] }, select: { id: true, companyName: true, user: { select: { id: true } } } })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }
    if (state.items.length === 0) return { ok: false, error: "Добавьте хотя бы одну строку услуг" }

    // Правило: АВР создаётся только контрагенту с действующим договором.
    const activeContract = await getActiveContractForTenant(tenant.id)
    if (!activeContract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

    // Защита от дубля: один АВР на (арендатор × период).
    if (state.period && /^\d{4}-\d{2}$/.test(state.period)) {
      const dup = await db.generatedDocument.findFirst({
        where: { organizationId: orgId, documentType: "ACT", tenantId: tenant.id, period: state.period },
        select: { number: true },
      })
      if (dup) return { ok: false, error: `За период ${state.period} АВР № ${dup.number} уже создан. Чтобы пересоздать — удалите старый в разделе «Документы».` }
    }

    const number = opts?.autoNumber ? await computeNextActNumber(orgId) : (state.meta.number || "").trim() || "Б/Н"
    const finalState: AvrState = { ...state, meta: { ...state.meta, number } }
    const buf = await renderAvrDocx(finalState)
    const total = avrTotal(finalState)
    const fileName = `АВР_${number}_${state.period || ""}.docx`

    const doc = await db.generatedDocument.create({
      data: {
        organizationId: orgId,
        documentType: "ACT",
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
    if (opts?.requestSignature && tenant.user?.id) {
      await notifyUser({
        userId: tenant.user.id,
        type: "DOCUMENT_SIGN_REQUEST",
        title: "Акт на подпись",
        message: `Вам выставлен Акт выполненных работ № ${number} — подпишите в кабинете → Документы.`,
        link: "/cabinet/documents",
        sendEmail: false,
      }).catch(() => {})
    }
    return { ok: true, documentId: doc.id, number }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать акт" }
  }
}
