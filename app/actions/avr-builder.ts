"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { type AvrState, type AvrPartyType, type AvrItem, defaultAvrState, periodEndDate, avrTotal } from "@/lib/avr-engine"
import { renderAvrDocx } from "@/lib/avr-engine/docx"
import { notifyUser } from "@/lib/notify"

function toAvrPartyType(legalType: string | null | undefined): AvrPartyType {
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

/** Следующий номер акта по организации (001, 002, …) среди чисто числовых. */
async function computeNextActNumber(orgId: string): Promise<string> {
  const rows = await db.generatedDocument.findMany({
    where: { organizationId: orgId, documentType: "ACT" },
    select: { number: true },
  })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (n > max) max = n }
  }
  return String(max + 1).padStart(3, "0")
}

export async function getNextActNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
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
): Promise<{ ok: boolean; error?: string; state?: AvrState }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Укажите период (месяц)" }

    const [tenant, organization] = await Promise.all([
      db.tenant.findFirst({
        where: { AND: [tenantScope(orgId), { id: tenantId }] },
        select: {
          companyName: true, legalType: true, bin: true, iin: true, legalAddress: true, actualAddress: true,
          directorName: true, directorPosition: true,
          user: { select: { name: true, phone: true, email: true } },
          charges: { where: { period }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true } },
          contracts: { orderBy: { createdAt: "desc" }, take: 1, select: { number: true, startDate: true } },
        },
      }),
      db.organization.findUnique({ where: { id: orgId }, select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true } }),
    ])
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    const req = organizationToRequisites(organization)
    const s = defaultAvrState()
    s.period = period
    const now = new Date()
    s.meta.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

    s.executor = {
      type: toAvrPartyType(req.legalType),
      name: req.fullName,
      binIin: req.taxId || req.bin || req.iin,
      address: req.legalAddress,
      comm: [req.phone, req.email].filter(Boolean).join(", "),
      signatory: req.directorShort || req.director,
      position: req.directorPosition || "Директор",
    }
    s.customer = {
      type: toAvrPartyType(tenant.legalType),
      name: tenant.companyName,
      binIin: tenant.bin || tenant.iin || "",
      address: tenant.legalAddress || tenant.actualAddress || "",
      comm: [tenant.user?.phone, tenant.user?.email].filter(Boolean).join(", "),
      signatory: tenant.directorName || tenant.user?.name || "",
      position: tenant.directorPosition || "Директор",
    }

    const contract = tenant.contracts[0]
    if (contract) {
      s.contractRef.number = contract.number
      if (contract.startDate) s.contractRef.date = new Date(contract.startDate).toISOString().slice(0, 10)
    }

    const date = periodEndDate(period)
    const items: AvrItem[] = []
    for (const c of tenant.charges) {
      items.push({ name: c.description || CHARGE_TYPE_LABEL[c.type] || c.type, date, report: "", unit: "усл.", qty: 1, price: Math.round(c.amount) })
    }
    if (items.length === 0) {
      items.push({ name: `Аренда нежилого помещения за ${period}`, date, report: "", unit: "мес", qty: 1, price: 0 })
    }
    s.items = items

    s.vat = { enabled: !!organization?.isVatPayer, rate: coerceKzVatRate(organization?.vatRate, DEFAULT_KZ_VAT_RATE) }

    return { ok: true, state: s }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить данные" }
  }
}

/** Генерирует DOCX акта (base64) для скачивания/предпросмотра без сохранения. */
export async function generateAvrDocx(state: AvrState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()
    const buf = await renderAvrDocx(state)
    const num = (state.meta.number || "").trim() || "акт"
    return { ok: true, base64: buf.toString("base64"), fileName: `АВР_${num}_${state.period || ""}.docx` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации" }
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
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const session = await auth()
    if (!tenantId) return { ok: false, error: "Сначала выберите арендатора" }

    const tenant = await db.tenant.findFirst({ where: { AND: [tenantScope(orgId), { id: tenantId }] }, select: { id: true, companyName: true, user: { select: { id: true } } } })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }
    if (state.items.length === 0) return { ok: false, error: "Добавьте хотя бы одну строку услуг" }

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
