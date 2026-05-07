import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { basicEmailTemplate, sendEmail } from "@/lib/email"
import { ROOT_HOST } from "@/lib/host"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { normalizeEmail } from "@/lib/contact-validation"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string } | null
  let email: string

  try {
    email = normalizeEmail(body?.email, { required: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Введите корректный email" },
      { status: 400 },
    )
  }

  const rateLimit = checkRateLimit(getClientKey(req.headers, "mobile-password-reset"), { max: 5, window: 15 * 60_000 })
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `Слишком много запросов. Попробуйте через ${Math.ceil(rateLimit.retryAfterSec / 60)} мин.` },
      { status: 429 },
    )
  }

  const genericMessage = `Если аккаунт с email ${email} существует, мы отправили письмо для восстановления пароля.`
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
  const html = basicEmailTemplate({
    title: "Восстановление пароля",
    body: `<p>Здравствуйте, ${user.name}!</p>
<p>Вы запросили восстановление пароля для Commrent. Ссылка действует 1 час.</p>`,
    buttonText: "Сбросить пароль",
    buttonUrl: link,
    footer: "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.",
  })

  const emailResult = await sendEmail({
    to: email,
    subject: "Восстановление пароля Commrent",
    html,
    text: `Ссылка для восстановления пароля: ${link}`,
  })

  if (!emailResult.ok && process.env.NODE_ENV !== "production") {
    return NextResponse.json({
      ok: true,
      message: "Email пока не настроен. В dev-режиме используйте ссылку ниже.",
      previewLink: link,
    })
  }

  if (!emailResult.ok) {
    console.error("[mobile-password-reset] delivery failed", emailResult.error)
  }

  return NextResponse.json({ ok: true, message: genericMessage })
}
