"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { getT, getTForUser } from "@/lib/i18n/server"

export type DocumentType = "INVOICE" | "ACT" | "CONTRACT" | "HANDOVER" | "RECONCILIATION"

interface SendDocumentParams {
  tenantId: string
  type: DocumentType
  period?: string
  number?: string
  /** Для акта сверки — диапазон месяцев (YYYY-MM). */
  from?: string
  to?: string
}

// Переводчик приходит параметром: помощники ниже сами его не добывают.
// Это тема и сопроводительный текст ПИСЬМА, а не текст документа во вложении —
// поэтому переводим их на язык арендатора (docs/i18n-documents-plan.md).
type Tr = Awaited<ReturnType<typeof getT>>["t"]

function documentSubject(t: Tr, type: DocumentType, number: string): string {
  switch (type) {
    case "INVOICE": return t("actions.sendDocument.subjectInvoice", { number })
    case "ACT": return t("actions.sendDocument.subjectAct", { number })
    case "CONTRACT": return t("actions.sendDocument.subjectContract", { number })
    case "HANDOVER": return t("actions.sendDocument.subjectHandover")
    case "RECONCILIATION": return t("actions.sendDocument.subjectReconciliation", { number })
  }
}

function documentBody(t: Tr, type: DocumentType, company: string): { intro: string; details: string } {
  const intro = type === "CONTRACT"
    ? t("actions.sendDocument.introPerson", { name: company })
    : t("actions.sendDocument.introCompany", { company })
  switch (type) {
    case "INVOICE": return { intro, details: t("actions.sendDocument.detailsInvoice") }
    case "ACT": return { intro, details: t("actions.sendDocument.detailsAct") }
    case "CONTRACT": return { intro, details: t("actions.sendDocument.detailsContract") }
    case "HANDOVER": return { intro, details: t("actions.sendDocument.detailsHandover") }
    case "RECONCILIATION": return { intro, details: t("actions.sendDocument.detailsReconciliation") }
  }
}

function documentNotificationTitle(t: Tr, type: DocumentType): string {
  switch (type) {
    case "INVOICE": return t("actions.sendDocument.notifyInvoice")
    case "ACT": return t("actions.sendDocument.notifyAct")
    case "RECONCILIATION": return t("actions.sendDocument.notifyReconciliation")
    case "CONTRACT": return t("actions.sendDocument.notifyContract")
    case "HANDOVER": return t("actions.sendDocument.notifyHandover")
  }
}

export async function sendDocumentToTenant(params: SendDocumentParams): Promise<{ ok: boolean; error?: string }> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.create")
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.common.accessDenied") }
  }
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: t("actions.common.noAccess") }
  }

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(params.tenantId, orgId)
  } catch {
    return { ok: false, error: t("actions.sendDocument.noTenantAccess") }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId },
    select: {
      id: true,
      companyName: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })

  if (!tenant) return { ok: false, error: t("actions.common.tenantNotFound") }
  const recipient = tenant.user.email // может быть null — тогда только in-app

  // Получаем DOCX из соответствующего эндпоинта
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "https"
  const baseUrl = `${proto}://${host}`

  const today = new Date()
  const period = params.period ?? today.toISOString().slice(0, 7)
  const from = params.from ?? `${today.getFullYear()}-01`
  const to = params.to ?? `${today.getFullYear()}-12`
  const number = params.number
    ?? (params.type === "RECONCILIATION" ? `${from}-001` : `${period.replace("-", "")}-001`)

  const docxUrlMap: Record<DocumentType, string> = {
    INVOICE: `${baseUrl}/api/invoices/generate?tenantId=${tenant.id}&period=${period}&number=${number}`,
    ACT: `${baseUrl}/api/acts/generate?tenantId=${tenant.id}&period=${period}&number=${number}`,
    CONTRACT: `${baseUrl}/api/contracts/generate?tenantId=${tenant.id}&number=${number}`,
    HANDOVER: `${baseUrl}/api/handover/generate?tenantId=${tenant.id}`,
    RECONCILIATION: `${baseUrl}/api/reconciliation/generate?tenantId=${tenant.id}&from=${from}&to=${to}`,
  }

  // Генерируем документ (эндпоинт сохраняет его в архив GeneratedDocument →
  // он становится виден арендатору в кабинете).
  const docxRes = await fetch(docxUrlMap[params.type], {
    headers: { cookie: h.get("cookie") ?? "" }, // прокинуть auth cookie
  })
  if (!docxRes.ok) {
    return { ok: false, error: t("actions.sendDocument.generateFailed", { status: docxRes.status }) }
  }
  const buffer = Buffer.from(await docxRes.arrayBuffer())
  // Письмо и уведомление читает арендатор — язык берём из его профиля.
  const { t: tTenant } = await getTForUser(tenant.user.id)
  const subject = documentSubject(tTenant, params.type, number)
  const body = documentBody(tTenant, params.type, tenant.companyName)

  // Email — только если у арендатора есть почта.
  let emailSent = false
  if (recipient) {
    let logId = ""
    try {
      const log = await db.emailLog.create({
        data: { organizationId: orgId, recipient, subject, type: params.type, tenantId: tenant.id, userId: tenant.user.id, status: "QUEUED" },
        select: { id: true },
      })
      logId = log.id
    } catch { /* журнал недоступен — продолжаем */ }

    const html = basicEmailTemplate({
      title: subject,
      body: `<p>${body.intro}</p><p>${body.details}</p><p>${tTenant("actions.sendDocument.attachmentNote")}</p>`,
      footer: tTenant("actions.sendDocument.mailFooter"),
    })
    // Имя файла вложения — часть самого документа, остаётся русским
    // (docs/i18n-documents-plan.md).
    const ext = params.type === "INVOICE" ? "Счет"
      : params.type === "ACT" ? "Акт"
      : params.type === "CONTRACT" ? "Договор"
      : params.type === "RECONCILIATION" ? "АктСверки"
      : "АктПриема"
    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      attachments: [{ filename: `${ext}_${number}.docx`, content: buffer }],
      trackingId: logId,
      trackingBaseUrl: baseUrl,
    })
    emailSent = result.ok
    if (logId) {
      try {
        await db.emailLog.update({ where: { id: logId }, data: { status: result.ok ? "SENT" : "FAILED", externalId: result.id, error: result.error } })
      } catch {}
    }
  }

  // In-app уведомление арендатору — всегда (даже без email).
  const docTitle = documentNotificationTitle(tTenant, params.type)
  await notifyUser({
    userId: tenant.user.id,
    type: `DOCUMENT_${params.type}`,
    title: docTitle,
    message: emailSent
      ? tTenant("actions.sendDocument.notifyMessageEmailed", { subject })
      : tTenant("actions.sendDocument.notifyMessage", { subject }),
    link: "/cabinet/documents",
    sendEmail: false,
  })

  revalidatePath(`/admin/tenants/${tenant.id}`)
  revalidatePath("/admin/documents")
  return { ok: true }
}
