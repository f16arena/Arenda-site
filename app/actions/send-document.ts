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

const SUBJECTS: Record<DocumentType, (n: string) => string> = {
  INVOICE: (n) => `Счёт на оплату № ${n}`,
  ACT: (n) => `Акт оказанных услуг № ${n}`,
  CONTRACT: (n) => `Договор аренды № ${n}`,
  HANDOVER: () => `Акт приёма-передачи помещения`,
  RECONCILIATION: (n) => `Акт сверки № ${n}`,
}

const BODIES: Record<DocumentType, (companyName: string) => { intro: string; details: string }> = {
  INVOICE: (n) => ({
    intro: `Уважаемые партнёры из «${n}»,`,
    details: "Направляем вам счёт на оплату за услуги аренды. Срок оплаты — 10 числа текущего месяца. По вопросам оплаты свяжитесь с бухгалтерией.",
  }),
  ACT: (n) => ({
    intro: `Уважаемые партнёры из «${n}»,`,
    details: "Направляем вам акт оказанных услуг для подписания. Просьба подписать в двух экземплярах, один экземпляр вернуть нам.",
  }),
  CONTRACT: (n) => ({
    intro: `Здравствуйте, ${n},`,
    details: "Высылаем договор аренды нежилого помещения. Просьба ознакомиться, при согласии подписать в двух экземплярах и вернуть один нам.",
  }),
  HANDOVER: (n) => ({
    intro: `Уважаемые партнёры из «${n}»,`,
    details: "Направляем акт приёма-передачи помещения для подписания.",
  }),
  RECONCILIATION: (n) => ({
    intro: `Уважаемые партнёры из «${n}»,`,
    details: "Направляем вам акт сверки взаиморасчётов. Просьба проверить данные и при согласии подписать.",
  }),
}

export async function sendDocumentToTenant(params: SendDocumentParams): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireCapabilityAndFeature("documents.create")
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Нет доступа" }
  }
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: "Не авторизован" }
  }

  const { orgId } = await requireOrgAccess()
  try {
    await assertTenantInOrg(params.tenantId, orgId)
  } catch {
    return { ok: false, error: "Нет доступа к этому арендатору" }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId },
    select: {
      id: true,
      companyName: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })

  if (!tenant) return { ok: false, error: "Арендатор не найден" }
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
    return { ok: false, error: `Не удалось сгенерировать документ (${docxRes.status})` }
  }
  const buffer = Buffer.from(await docxRes.arrayBuffer())
  const subject = SUBJECTS[params.type](number)
  const body = BODIES[params.type](tenant.companyName)

  // Email — только если у арендатора есть почта.
  let emailSent = false
  if (recipient) {
    let logId = ""
    try {
      const log = await db.emailLog.create({
        data: { recipient, subject, type: params.type, tenantId: tenant.id, userId: tenant.user.id, status: "QUEUED" },
        select: { id: true },
      })
      logId = log.id
    } catch { /* журнал недоступен — продолжаем */ }

    const html = basicEmailTemplate({
      title: subject,
      body: `<p>${body.intro}</p><p>${body.details}</p><p>Документ во вложении.</p>`,
      footer: "По вопросам обращайтесь в администрацию",
    })
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
  const docTitle = params.type === "INVOICE" ? "Новый счёт на оплату"
    : params.type === "ACT" ? "Акт оказанных услуг"
    : params.type === "RECONCILIATION" ? "Акт сверки"
    : params.type === "CONTRACT" ? "Новый договор ожидает подписания"
    : "Акт приёма-передачи"
  await notifyUser({
    userId: tenant.user.id,
    type: `DOCUMENT_${params.type}`,
    title: docTitle,
    message: `${subject}. ${emailSent ? "Отправлен на ваш email и доступен" : "Доступен"} в кабинете → Документы.`,
    link: "/cabinet/documents",
    sendEmail: false,
  })

  revalidatePath(`/admin/tenants/${tenant.id}`)
  revalidatePath("/admin/documents")
  return { ok: true }
}
