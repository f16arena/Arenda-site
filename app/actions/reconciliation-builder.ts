"use server"

import { db } from "@/lib/db"
import { convertDocxToPdf, pdfConvertConfigured } from "@/lib/pdf-convert"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { resolveMonthRange } from "@/lib/period-range"
import { type ReconState, type ReconPartyType, type ReconEntry, defaultReconState, reconClosing } from "@/lib/reconciliation-engine"
import { renderReconDocx } from "@/lib/reconciliation-engine/docx"
import { notifyUser } from "@/lib/notify"
import { getActiveContractForTenant, NO_ACTIVE_CONTRACT_ERROR } from "@/lib/active-contract"

function toPartyType(legalType: string | null | undefined): ReconPartyType {
  const t = String(legalType ?? "").toUpperCase()
  if (t === "PHYSICAL") return "individual"
  if (t === "IP") return "ip"
  return "too"
}

const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода", HEATING: "Отопление",
  GARBAGE: "Вывоз мусора", SECURITY: "Охрана", INTERNET: "Интернет", GAS: "Газ",
  CLEANING: "Уборка", SERVICE_FEE: "Эксплуатационные расходы", PENALTY: "Пеня",
  DEPOSIT: "Депозит", OTHER: "Прочее",
}

const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

async function computeNextReconNumber(orgId: string): Promise<string> {
  const rows = await db.generatedDocument.findMany({ where: { organizationId: orgId, documentType: "RECONCILIATION" }, select: { number: true } })
  let max = 0
  for (const r of rows) {
    const t = (r.number ?? "").trim()
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (n > max) max = n }
  }
  return String(max + 1).padStart(3, "0")
}

export async function getNextReconNumber(): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    return { ok: true, number: await computeNextReconNumber(orgId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось получить номер" }
  }
}

export async function prefillReconFromTenant(
  tenantId: string,
  from: string,
  to: string,
): Promise<{ ok: boolean; error?: string; state?: ReconState }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const range = resolveMonthRange({ from, to })

    const [tenant, req] = await Promise.all([
      db.tenant.findFirst({
        where: { AND: [tenantScope(orgId), { id: tenantId }] },
        select: {
          companyName: true, legalType: true, bin: true, iin: true, directorName: true, directorPosition: true,
          user: { select: { name: true } },
          // deletedAt: null — удалённые начисления/платежи не должны попадать в официальный акт (аудит 2026-06-10, п.2).
          charges: { where: { period: { gte: range.from, lte: range.to }, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true, description: true, period: true, createdAt: true } },
          payments: { where: { paymentDate: { gte: range.fromDate, lt: range.toEndExclusive }, deletedAt: null }, orderBy: { paymentDate: "asc" }, select: { amount: true, paymentDate: true, method: true, note: true } },
        },
      }),
      getOrganizationRequisites(orgId),
    ])
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    // Правило: акт сверки выставляется только по действующему договору.
    const activeContract = await getActiveContractForTenant(tenantId)
    if (!activeContract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

    // Входящее сальдо: начисления до периода − оплаты до периода.
    const [chargesBefore, paymentsBefore] = await Promise.all([
      db.charge.findMany({ where: { tenantId, period: { lt: range.from }, deletedAt: null }, select: { amount: true } }),
      db.payment.findMany({ where: { tenantId, paymentDate: { lt: range.fromDate }, deletedAt: null }, select: { amount: true } }),
    ])
    const opening = Math.round(
      chargesBefore.reduce((s, c) => s + c.amount, 0) - paymentsBefore.reduce((s, p) => s + p.amount, 0),
    )

    const s = defaultReconState()
    s.period = { from: range.from, to: range.to }
    const now = new Date()
    s.meta.date = iso(now)
    s.openingBalance = opening

    s.org = {
      type: toPartyType(req.legalType),
      name: req.fullName,
      binIin: req.taxId || req.bin || req.iin,
      signatory: req.directorShort || req.director,
      position: req.directorPosition || "Директор",
    }
    s.tenant = {
      type: toPartyType(tenant.legalType),
      name: tenant.companyName,
      binIin: tenant.bin || tenant.iin || "",
      signatory: tenant.directorName || tenant.user?.name || "",
      position: tenant.directorPosition || "Директор",
    }

    const entries: ReconEntry[] = []
    for (const c of tenant.charges) {
      entries.push({ date: iso(c.createdAt), doc: `${CHARGE_TYPES[c.type] ?? c.type} · ${c.period}${c.description ? ` (${c.description})` : ""}`, debit: Math.round(c.amount), credit: 0 })
    }
    for (const p of tenant.payments) {
      entries.push({ date: iso(p.paymentDate), doc: `Оплата · ${p.method}${p.note ? ` (${p.note})` : ""}`, debit: 0, credit: Math.round(p.amount) })
    }
    entries.sort((a, b) => a.date.localeCompare(b.date))
    s.entries = entries

    return { ok: true, state: s }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить данные" }
  }
}

export async function generateReconDocx(state: ReconState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()
    const buf = await renderReconDocx(state)
    const num = (state.meta.number || "").trim() || "сверка"
    return { ok: true, base64: buf.toString("base64"), fileName: `Акт_сверки_${num}.docx` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации" }
  }
}

/** Акт сверки строго в PDF (DOCX → конвертер на VPS). */
export async function generateReconPdf(state: ReconState): Promise<{ ok: boolean; error?: string; base64?: string; fileName?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    await requireOrgAccess()
    if (!pdfConvertConfigured()) return { ok: false, error: "PDF-конвертер не настроен (PDF_CONVERT_URL/SECRET)." }
    const buf = await renderReconDocx(state)
    const num = (state.meta.number || "").trim() || "сверка"
    const pdf = await convertDocxToPdf(buf, `Акт_сверки_${num}.docx`)
    return { ok: true, base64: pdf.toString("base64"), fileName: `Акт_сверки_${num}.pdf` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка генерации PDF" }
  }
}

export async function createReconFromBuilder(
  tenantId: string,
  state: ReconState,
  opts?: { autoNumber?: boolean; requestSignature?: boolean },
): Promise<{ ok: boolean; error?: string; documentId?: string; number?: string }> {
  try {
    await requireCapabilityAndFeature("documents.uploadTemplate")
    const { orgId } = await requireOrgAccess()
    const session = await auth()
    if (!tenantId) return { ok: false, error: "Сначала выберите арендатора" }

    const tenant = await db.tenant.findFirst({ where: { AND: [tenantScope(orgId), { id: tenantId }] }, select: { id: true, companyName: true, user: { select: { id: true } } } })
    if (!tenant) return { ok: false, error: "Арендатор не найден или нет доступа" }

    // Правило: акт сверки создаётся только контрагенту с действующим договором.
    const activeContract = await getActiveContractForTenant(tenant.id)
    if (!activeContract) return { ok: false, error: NO_ACTIVE_CONTRACT_ERROR }

    // Защита от дубля: один акт сверки на (арендатор × период).
    if (state.period?.from && state.period?.to) {
      const periodStr = `${state.period.from}…${state.period.to}`
      const dup = await db.generatedDocument.findFirst({
        where: { organizationId: orgId, documentType: "RECONCILIATION", tenantId: tenant.id, period: periodStr },
        select: { number: true },
      })
      if (dup) return { ok: false, error: `Акт сверки за этот период (№ ${dup.number}) уже создан. Чтобы пересоздать — удалите старый в разделе «Документы».` }
    }

    const number = opts?.autoNumber ? await computeNextReconNumber(orgId) : (state.meta.number || "").trim() || "Б/Н"
    const finalState: ReconState = { ...state, meta: { ...state.meta, number } }
    const buf = await renderReconDocx(finalState)
    const fileName = `Акт_сверки_${number}.docx`

    const doc = await db.generatedDocument.create({
      data: {
        organizationId: orgId,
        documentType: "RECONCILIATION",
        number,
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        period: `${state.period.from}…${state.period.to}`,
        totalAmount: reconClosing(finalState),
        fileName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fileBytes: buf as any,
        fileSize: buf.length,
        format: "DOCX",
        generatedById: session?.user.id ?? null,
        // Акт сверки отправляется арендатору на подтверждение взаиморасчётов.
        reconStatus: "SENT",
      },
      select: { id: true },
    })
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${tenant.id}`)
    if (opts?.requestSignature && tenant.user?.id) {
      await notifyUser({
        userId: tenant.user.id,
        type: "DOCUMENT_SIGN_REQUEST",
        title: "Акт сверки на подпись",
        message: `Вам выставлен Акт сверки № ${number} — подпишите в кабинете → Документы.`,
        link: "/cabinet/documents",
        sendEmail: false,
      }).catch(() => {})
    }
    return { ok: true, documentId: doc.id, number }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать акт сверки" }
  }
}
