import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail, basicEmailTemplate } from "@/lib/email"

export const dynamic = "force-dynamic"

// POST — отправить ссылку для подтверждения почты
export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const rl = checkRateLimit(`mobile-verify-email:${result.ctx.user.id}`, {
    max: 3,
    window: 10 * 60_000,
  })
  if (!rl.ok) {
    return mobileError(
      `Можно запрашивать раз в несколько минут. Повторите через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
      429,
    )
  }

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  })
  if (!user) return mobileError("Пользователь не найден", 404)
  if (!user.email) return mobileError("На аккаунте не указана почта", 400)
  if (user.emailVerifiedAt) return mobileError("Почта уже подтверждена", 409)

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
    title: "Подтвердите почту",
    body: `<p>Здравствуйте, ${user.name}!</p><p>Подтвердите адрес <b>${user.email}</b> — нажмите кнопку ниже. Ссылка действует 24 часа.</p>`,
    buttonText: "Подтвердить",
    buttonUrl: verifyUrl,
  })

  const sendResult = await sendEmail({
    to: user.email,
    subject: "Подтверждение почты — Commrent",
    html,
    text: `Подтвердите почту: ${verifyUrl}`,
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

  const body = (await req.json().catch(() => null)) as { token?: string } | null
  const token = String(body?.token ?? "").trim()
  if (!token) return mobileError("Не указан токен")

  const record = await db.verificationToken.findUnique({ where: { token } })
  if (!record) return mobileError("Токен не найден", 404)
  if (record.usedAt) return mobileError("Токен уже использован", 409)
  if (record.expiresAt < new Date()) return mobileError("Токен просрочен", 410)
  if (record.type !== "EMAIL_VERIFY") return mobileError("Неверный тип токена", 400)
  if (record.userId !== result.ctx.user.id) return mobileError("Чужой токен", 403)

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { email: true },
  })
  if (!user || user.email !== record.target) return mobileError("Почта изменилась", 409)

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
