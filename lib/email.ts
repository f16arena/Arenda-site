// Email helper через Resend (бесплатный тариф 100 писем/день).
// Если RESEND_API_KEY не задан — просто логирует и возвращает false.
//
// Setup:
// 1. Зарегистрироваться на resend.com
// 2. Подтвердить домен или использовать onboarding@resend.dev для тестов
// 3. В Vercel env: RESEND_API_KEY=re_xxxxx, EMAIL_FROM="Commrent <noreply@commrent.kz>"

import { Resend } from "resend"

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: { filename: string; content: Buffer | string }[]
  replyTo?: string
  // Для трекинга открытий — добавится pixel в HTML если задан
  trackingId?: string
  trackingBaseUrl?: string
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

let cached: Resend | null = null

function getClient(): Resend | null {
  if (cached) return cached
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  cached = new Resend(key)
  return cached
}

export async function sendEmail(p: SendEmailParams): Promise<SendResult> {
  const client = getClient()
  const from = process.env.EMAIL_FROM || "Commrent <onboarding@resend.dev>"

  // Добавляем трекинг-пиксель если задан
  let html = p.html
  if (p.trackingId && p.trackingBaseUrl) {
    const pixel = `<img src="${p.trackingBaseUrl}/api/email/track?id=${encodeURIComponent(p.trackingId)}" width="1" height="1" alt="" style="display:none" />`
    html = html.replace("</body>", `${pixel}</body>`)
    if (!html.includes(pixel)) html += pixel
  }

  if (!client) {
    console.warn("[email] RESEND_API_KEY не задан — пропускаю отправку:", p.subject)
    return { ok: false, error: "RESEND_API_KEY не задан" }
  }

  try {
    const res = await client.emails.send({
      from,
      to: p.to,
      subject: p.subject,
      html,
      text: p.text,
      replyTo: p.replyTo,
      attachments: p.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" ? a.content : a.content.toString("base64"),
      })),
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, id: res.data?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" }
  }
}

/** Эскейпит спецсимволы HTML (для безопасной подстановки tenant.name и пр.) */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Эскейпит URL — только http/https, чтобы не вставить javascript: или data: */
function safeUrl(url: string): string {
  const u = url.trim()
  if (/^https?:\/\//i.test(u) || u.startsWith("/")) return escapeHtml(u)
  return "#"
}

// Генерирует базовый HTML-шаблон письма.
// title и footer экранируются автоматически. body — это HTML-фрагмент,
// который должен подставляться вызывающим кодом уже безопасным.
// Кто формирует письмо — обязан эскейпить пользовательские строки в body
// через escapeHtml (см. ниже экспортируется как htmlEscape).
export function basicEmailTemplate(params: {
  title: string
  body: string  // HTML-фрагмент: пользовательские поля внутри должны быть уже эскейпнуты
  buttonText?: string
  buttonUrl?: string
  footer?: string
}): string {
  const { title, body, buttonText, buttonUrl, footer } = params
  const safeTitle = escapeHtml(title)
  const safeFooter = footer ? escapeHtml(footer) : "Это автоматическое письмо от системы управления арендой. По вопросам свяжитесь с администрацией."
  const safeButtonText = buttonText ? escapeHtml(buttonText) : ""
  const safeButtonUrl = buttonUrl ? safeUrl(buttonUrl) : ""
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
<tr><td style="padding:24px;background:#0f172a;color:white;">
<h1 style="margin:0;font-size:18px;font-weight:600;">Commrent</h1>
</td></tr>
<tr><td style="padding:32px 24px;color:#0f172a;font-size:14px;line-height:1.6;">
<h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;">${safeTitle}</h2>
${body}
${safeButtonText && safeButtonUrl ? `
<div style="margin-top:24px;text-align:center;">
<a href="${safeButtonUrl}" style="display:inline-block;background:#0f172a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;">${safeButtonText}</a>
</div>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;text-align:center;">
${safeFooter}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/** Хелпер для безопасной подстановки пользовательских строк в HTML body писем */
export const htmlEscape = escapeHtml
