"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

export type DocumentType = "INVOICE" | "ACT" | "CONTRACT" | "HANDOVER"

interface SendDocumentParams {
  tenantId: string
  type: DocumentType
  period?: string
  number?: string
}

const SUBJECTS: Record<DocumentType, (n: string) => string> = {
  INVOICE: (n) => `Счёт-фактура № ${n}`,
  ACT: (n) => `Акт оказанных услуг № ${n}`,
  CONTRACT: (n) => `Договор аренды № ${n}`,
  HANDOVER: () => `Акт приёма-передачи помещения`,
}

const BODIES: Record<DocumentType, (companyName: string) => { intro: string; details: string }> = {
  INVOICE: (n) => ({
    intro: `Уважаемые партнёры из «${n}»,`,
    details: "Направляем вам счёт-фактуру за услуги аренды. Срок оплаты — 10 числа текущего месяца. По вопросам оплаты свяжитесь с бухгалтерией.",
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
}

export async function sendDocumentToTenant(params: SendDocumentParams): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: "Не авторизован" }
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
  const recipient = tenant.user.email
  if (!recipient) return { ok: false, error: "У арендатора не указан email" }

  // Получаем DOCX из соответствующего эндпоинта
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "https"
  const baseUrl = `${proto}://${host}`

  const today = new Date()
  const period = params.period ?? today.toISOString().slice(0, 7)
  const number = params.number ?? `${period.replace("-", "")}-001`

  const docxUrlMap: Record<DocumentType, string> = {
    INVOICE: `${baseUrl}/api/invoices/generate?tenantId=${tenant.id}&period=${period}&number=${number}`,
    ACT: `${baseUrl}/api/acts/generate?tenantId=${tenant.id}&period=${period}&number=${number}`,
    CONTRACT: `${baseUrl}/api/contracts/generate?tenantId=${tenant.id}&number=${number}`,
    HANDOVER: `${baseUrl}/api/handover/generate?tenantId=${tenant.id}`,
  }

  // Скачиваем DOCX
  const docxRes = await fetch(docxUrlMap[params.type], {
    headers: { cookie: h.get("cookie") ?? "" }, // прокинуть auth cookie
  })

  if (!docxRes.ok) {
    return { ok: false, error: `Не удалось сгенерировать документ (${docxRes.status})` }
  }

  const buffer = Buffer.from(await docxRes.arrayBuffer())
  const subject = SUBJECTS[params.type](number)
  const body = BODIES[params.type](tenant.companyName)

  // Сначала создаём запись в журнале (чтобы получить id для трекинга)
  let logId = ""
  try {
    const log = await db.emailLog.create({
      data: {
        recipient,
        subject,
        type: params.type,
        tenantId: tenant.id,
        userId: tenant.user.id,
        status: "QUEUED",
      },
      select: { id: true },
    })
    logId = log.id
  } catch {
    // Таблица не создана — продолжаем без журнала
  }

  // HTML письма
  const html = basicEmailTemplate({
    title: subject,
    body: `<p>${body.intro}</p><p>${body.details}</p><p>Документ во вложении.</p>`,
    footer: "БЦ F16 · По вопросам обращайтесь в администрацию",
  })

  const ext = params.type === "INVOICE" ? "Счет" : params.type === "ACT" ? "Акт" : params.type === "CONTRACT" ? "Договор" : "АктПриема"
  const result = await sendEmail({
    to: recipient,
    subject,
    html,
    attachments: [
      { filename: `${ext}_${number}.docx`, content: buffer },
    ],
    trackingId: logId,
    trackingBaseUrl: baseUrl,
  })

  // Обновим журнал
  if (logId) {
    try {
      await db.emailLog.update({
        where: { id: logId },
        data: {
          status: result.ok ? "SENT" : "FAILED",
          externalId: result.id,
          error: result.error,
        },
      })
    } catch {}
  }

  if (result.ok) {
    revalidatePath(`/admin/tenants/${tenant.id}`)
  }
  return result
}
