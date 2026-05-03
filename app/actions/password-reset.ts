"use server"

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import type { Result } from "./my-account"

/**
 * Шаг 1: пользователь вводит email на /forgot-password.
 * Если такой email есть — создаём токен и шлём письмо.
 * ВАЖНО: всегда возвращаем "успех" (даже если email не найден),
 * чтобы по ответу нельзя было узнать, существует ли аккаунт.
 */
export async function requestPasswordReset(formData: FormData): Promise<Result & { previewLink?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Введите корректный email" }
  }

  // Rate limit: 5 запросов сброса за 15 минут с одного IP
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, "pwd-reset"), { max: 5, window: 15 * 60_000 })
  if (!rl.ok) {
    return {
      ok: false,
      error: `Слишком много запросов. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
    }
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  })

  // Если юзер не найден или неактивен — молча возвращаем успех
  // (не раскрываем существование аккаунта).
  if (!user || !user.isActive) {
    return { ok: true, message: `Если аккаунт с email ${email} существует — на него отправлено письмо со ссылкой для сброса пароля.` }
  }

  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 1 * 3600 * 1000) // 1 час

  await db.verificationToken.create({
    data: {
      userId: user.id,
      type: "PASSWORD_RESET",
      target: email,
      token,
      expiresAt,
    },
  })

  const h = reqHeaders
  const host = h.get("host") ?? "commrent.kz"
  const proto = h.get("x-forwarded-proto") ?? "https"
  // Всегда отправляем на root-домен — на slug-поддомене /reset-password недоступен.
  const rootHost = process.env.ROOT_HOST || "commrent.kz"
  const linkHost = host.includes(rootHost) ? rootHost : host
  const link = `${proto}://${linkHost}/reset-password?token=${token}`

  const html = basicEmailTemplate({
    title: "Сброс пароля",
    body: `<p>Здравствуйте, ${user.name}!</p>
<p>Вы (или кто-то от вашего имени) запросили сброс пароля для аккаунта в Commrent.</p>
<p>Перейдите по ссылке для установки нового пароля. Ссылка действительна <b>1 час</b>.</p>`,
    buttonText: "Сбросить пароль",
    buttonUrl: link,
    footer: "Если вы не запрашивали сброс — просто проигнорируйте это письмо. Текущий пароль остаётся в силе.",
  })

  const emailResult = await sendEmail({
    to: email,
    subject: "Сброс пароля для Commrent",
    html,
    text: `Перейдите по ссылке для сброса пароля: ${link}`,
  })

  if (!emailResult.ok) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] password reset delivery failed", emailResult.error)
      return {
        ok: true,
        message: `Если аккаунт с email ${email} существует — на него отправлено письмо со ссылкой для сброса пароля.`,
      }
    }

    // Resend не настроен — отдаём ссылку прямо в UI (для разработки/первого запуска)
    return {
      ok: true,
      message: "Email-отправка пока не настроена. Используйте ссылку:",
      previewLink: link,
    }
  }

  return {
    ok: true,
    message: `Если аккаунт с email ${email} существует — на него отправлено письмо со ссылкой для сброса пароля.`,
  }
}

/**
 * Шаг 2: пользователь переходит по ссылке /reset-password?token=...
 * и устанавливает новый пароль.
 */
export async function resetPassword(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!token) return { ok: false, error: "Токен отсутствует" }
  if (newPassword.length < 8) return { ok: false, error: "Пароль минимум 8 символов" }
  if (newPassword !== confirmPassword) return { ok: false, error: "Пароли не совпадают" }

  const t = await db.verificationToken.findUnique({ where: { token } })
  if (!t) return { ok: false, error: "Токен не найден" }
  if (t.usedAt) return { ok: false, error: "Ссылка уже использована" }
  if (t.expiresAt < new Date()) return { ok: false, error: "Срок действия ссылки истёк" }
  if (t.type !== "PASSWORD_RESET") return { ok: false, error: "Неверный тип токена" }
  if (!t.userId) return { ok: false, error: "Токен не привязан к пользователю" }

  const hash = await bcrypt.hash(newPassword, 10)

  await db.$transaction([
    db.user.update({
      where: { id: t.userId },
      data: { password: hash },
    }),
    db.verificationToken.update({
      where: { id: t.id },
      data: { usedAt: new Date() },
    }),
    // Инвалидируем все остальные активные password-reset токены этого юзера —
    // чтобы старые ссылки не остались работающими.
    db.verificationToken.updateMany({
      where: {
        userId: t.userId,
        type: "PASSWORD_RESET",
        usedAt: null,
        id: { not: t.id },
      },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true, message: "Пароль изменён. Теперь вы можете войти с новым паролем." }
}
