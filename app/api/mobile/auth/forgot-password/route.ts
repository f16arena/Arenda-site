import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { basicEmailTemplate, sendEmail } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { normalizeEmail } from "@/lib/contact-validation"
import { getT, getTForUser } from "@/lib/i18n/server"
import { htmlEscape } from "@/lib/email"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  // Эндпоинт анонимный: кто просит сброс, мы ещё не знаем, поэтому ответ идёт
  // на языке запроса (cookie/сессия), а само письмо — на языке получателя.
  const { t } = await getT()
  const body = await req.json().catch(() => null) as { email?: string } | null
  let email: string

  try {
    email = normalizeEmail(body?.email, { required: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t("adminDocs.api.auth.emailInvalid") },
      { status: 400 },
    )
  }

  const rateLimit = checkRateLimit(getClientKey(req.headers, "mobile-password-reset"), { max: 5, window: 15 * 60_000 })
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: t("adminDocs.api.common.rateLimited", { minutes: Math.ceil(rateLimit.retryAfterSec / 60) }) },
      { status: 429 },
    )
  }

  const genericMessage = t("emails.resetPassword.generic", { email })
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  })

  if (!user?.isActive) {
    return NextResponse.json({ ok: true, message: genericMessage })
  }

  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 60 * 60_000)

  await db.verificationToken.create({
    data: {
      userId: user.id,
      type: "PASSWORD_RESET",
      target: email,
      token,
      expiresAt,
    },
  })

  const proto = req.headers.get("x-forwarded-proto") ?? "https"
  const link = `${proto}://${ROOT_HOST}/reset-password?token=${token}`
  // Письмо читает владелец аккаунта — язык из его профиля, не из запроса.
  const { t: tMail, locale: mailLocale } = await getTForUser(user.id)
  const html = basicEmailTemplate({
    lang: mailLocale,
    title: tMail("emails.resetPassword.title"),
    body: `<p>${htmlEscape(tMail("emails.common.greetingNamed", { name: user.name }))}</p>
<p>${tMail("emails.resetPassword.body")}</p>`,
    buttonText: tMail("emails.resetPassword.button"),
    buttonUrl: link,
    footer: tMail("emails.resetPassword.footer"),
  })

  const emailResult = await sendEmail({
    to: email,
    subject: tMail("emails.resetPassword.subject"),
    html,
    text: tMail("emails.resetPassword.text", { link }),
  })

  if (!emailResult.ok && process.env.NODE_ENV !== "production") {
    return NextResponse.json({
      ok: true,
      message: t("emails.resetPassword.devHint"),
      previewLink: link,
    })
  }

  if (!emailResult.ok) {
    console.error("[mobile-password-reset] delivery failed", emailResult.error)
  }

  return NextResponse.json({ ok: true, message: genericMessage })
}
