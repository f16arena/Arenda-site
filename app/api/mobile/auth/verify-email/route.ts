import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

// POST — отправить ссылку для подтверждения почты
export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  // Письмо и ошибки читает владелец аккаунта — язык из его профиля.
  const { t, locale } = await getTForUser(result.ctx.user.id)
  const rl = checkRateLimit(`mobile-verify-email:${result.ctx.user.id}`, {
    max: 3,
    window: 10 * 60_000,
  })
  if (!rl.ok) {
    return mobileError(
      t("adminDocs.api.auth.verifyTooOften", { minutes: Math.ceil(rl.retryAfterSec / 60) }),
      429,
    )
  }

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  })
  if (!user) return mobileError(t("adminDocs.api.common.userNotFound"), 404)
  if (!user.email) return mobileError(t("adminDocs.api.auth.noEmailOnAccount"), 400)
  if (user.emailVerifiedAt) return mobileError(t("adminDocs.api.auth.emailAlreadyVerified"), 409)

  const token = randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000)
  await db.verificationToken.create({
    data: {
      userId: user.id,
      type: "EMAIL_VERIFY",
      target: user.email,
      token,
      expiresAt,
    },
  })

  const origin = new URL(req.url).origin
  const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`

  const html = basicEmailTemplate({
    lang: locale,
    title: t("emails.verifyEmail.title"),
    // Имя и адрес эскейпим: body уходит в письмо как готовый HTML.
    body: `<p>${htmlEscape(t("emails.common.greetingNamed", { name: user.name }))}</p><p>${t("emails.verifyEmail.body", { email: htmlEscape(user.email) })}</p>`,
    buttonText: t("emails.verifyEmail.button"),
    buttonUrl: verifyUrl,
    footer: t("emails.common.autoFooter"),
  })

  const sendResult = await sendEmail({
    to: user.email,
    subject: t("emails.verifyEmail.subject"),
    html,
    text: t("emails.verifyEmail.text", { link: verifyUrl }),
  })

  return NextResponse.json({
    ok: true,
    sent: sendResult.ok,
    previewUrl: process.env.NODE_ENV === "production" ? undefined : verifyUrl,
  })
}

// PATCH — подтвердить токеном
export async function PATCH(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const { t } = await getTForUser(result.ctx.user.id)
  const body = (await req.json().catch(() => null)) as { token?: string } | null
  const token = String(body?.token ?? "").trim()
  if (!token) return mobileError(t("adminDocs.api.auth.tokenMissing"))

  const record = await db.verificationToken.findUnique({ where: { token } })
  if (!record) return mobileError(t("adminDocs.api.auth.tokenNotFound"), 404)
  if (record.usedAt) return mobileError(t("adminDocs.api.auth.tokenUsed"), 409)
  if (record.expiresAt < new Date()) return mobileError(t("adminDocs.api.auth.tokenExpired"), 410)
  if (record.type !== "EMAIL_VERIFY") return mobileError(t("adminDocs.api.auth.tokenWrongType"), 400)
  if (record.userId !== result.ctx.user.id) return mobileError(t("adminDocs.api.auth.tokenForeign"), 403)

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { email: true },
  })
  if (!user || user.email !== record.target) return mobileError(t("adminDocs.api.auth.emailChanged"), 409)

  await db.$transaction([
    db.user.update({
      where: { id: result.ctx.user.id },
      data: { emailVerifiedAt: new Date() },
    }),
    db.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])

  return NextResponse.json({ ok: true })
}
