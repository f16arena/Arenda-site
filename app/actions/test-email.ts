"use server"

import { requirePlatformOwner } from "@/lib/org"
import { sendEmail } from "@/lib/email"
import { normalizeEmail } from "@/lib/contact-validation"
import { getT } from "@/lib/i18n/server"

export type TestEmailResult = {
  ok: boolean
  id?: string
  error?: string
  from: string
}

// Диагностика доставки email: платформенный владелец отправляет тестовое письмо
// и видит РЕАЛЬНЫЙ ответ Resend (например «домен не подтверждён»), а не молчаливый
// провал, как в self-service сбросе пароля.
export async function sendTestEmail(to: string): Promise<TestEmailResult> {
  await requirePlatformOwner()
  const { t } = await getT()
  const from = process.env.EMAIL_FROM || "(fallback onboarding@resend.dev)"

  let email: string
  try {
    email = normalizeEmail(to, { required: true })!
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.testEmail.badEmail"), from }
  }

  const res = await sendEmail({
    to: email,
    subject: t("actions.testEmail.subject"),
    html: `<p>${t("actions.testEmail.html")}</p>`,
    text: t("actions.testEmail.text"),
  })

  return { ok: res.ok, id: res.id, error: res.error, from }
}
