"use server"

import { db } from "@/lib/db"
import { headers } from "next/headers"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { normalizeEmail } from "@/lib/contact-validation"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import type { Result } from "./my-account"
import { audit } from "@/lib/audit"
import { getT, getTForUser } from "@/lib/i18n/server"

/**
 * Шаг 1: пользователь вводит email на /forgot-password.
 * Если такой email есть — создаём токен и шлём письмо.
 * ВАЖНО: всегда возвращаем "успех" (даже если email не найден),
 * чтобы по ответу нельзя было узнать, существует ли аккаунт.
 */
export async function requestPasswordReset(formData: FormData): Promise<Result & { previewLink?: string }> {
  const { t } = await getT()
  let email: string
  try {
    email = normalizeEmail(formData.get("email"), { required: true })!
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t("actions.myAccount.invalidEmail") }
  }

  // Rate limit: 5 запросов сброса за 15 минут с одного IP
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, "pwd-reset"), { max: 5, window: 15 * 60_000 })
  if (!rl.ok) {
    return {
      ok: false,
      error: t("actions.common.tooManyRequests", { minutes: Math.ceil(rl.retryAfterSec / 60) }),
    }
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  })

  // Если юзер не найден или неактивен — молча возвращаем успех
  // (не раскрываем существование аккаунта).
  if (!user || !user.isActive) {
    return { ok: true, message: t("actions.passwordReset.maybeSent", { email }) }
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

  // Письмо читает владелец аккаунта — берём язык из его профиля.
  const { t: tUser } = await getTForUser(user.id)
  const html = basicEmailTemplate({
    title: tUser("actions.passwordReset.mailTitle"),
    body: `<p>${tUser("actions.passwordReset.mailGreeting", { name: user.name })}</p>
<p>${tUser("actions.passwordReset.mailLead")}</p>
<p>${tUser("actions.passwordReset.mailAction")}</p>`,
    buttonText: tUser("actions.passwordReset.mailButton"),
    buttonUrl: link,
    footer: tUser("actions.passwordReset.mailFooter"),
  })

  const emailResult = await sendEmail({
    to: email,
    subject: tUser("actions.passwordReset.mailSubject"),
    html,
    text: tUser("actions.passwordReset.mailText", { link }),
  })

  if (!emailResult.ok) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] password reset delivery failed", emailResult.error)
      return {
        ok: true,
        message: t("actions.passwordReset.maybeSent", { email }),
      }
    }

    // Resend не настроен — отдаём ссылку прямо в UI (для разработки/первого запуска)
    return {
      ok: true,
      message: t("actions.myAccount.mailNotConfigured"),
      previewLink: link,
    }
  }

  return {
    ok: true,
    message: t("actions.passwordReset.maybeSent", { email }),
  }
}

/**
 * Шаг 2: пользователь переходит по ссылке /reset-password?token=...
 * и устанавливает новый пароль.
 */
export async function resetPassword(formData: FormData): Promise<Result> {
  const { t } = await getT()
  const token = String(formData.get("token") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!token) return { ok: false, error: t("actions.passwordReset.tokenMissing") }
  if (newPassword.length < 8) return { ok: false, error: t("actions.myAccount.newPasswordTooShort") }
  if (newPassword !== confirmPassword) return { ok: false, error: t("actions.myAccount.passwordsMismatch") }

  // Имя t занято переводчиком — запись токена называется record.
  const record = await db.verificationToken.findUnique({ where: { token } })
  if (!record) return { ok: false, error: t("actions.myAccount.tokenNotFound") }
  if (record.usedAt) return { ok: false, error: t("actions.myAccount.linkAlreadyUsed") }
  if (record.expiresAt < new Date()) return { ok: false, error: t("actions.myAccount.linkExpired") }
  if (record.type !== "PASSWORD_RESET") return { ok: false, error: t("actions.myAccount.tokenWrongType") }
  if (!record.userId) return { ok: false, error: t("actions.myAccount.tokenNoUser") }

  const hash = await bcrypt.hash(newPassword, 10)

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: {
        password: hash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    db.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Инвалидируем все остальные активные password-reset токены этого юзера —
    // чтобы старые ссылки не остались работающими.
    db.verificationToken.updateMany({
      where: {
        userId: record.userId,
        type: "PASSWORD_RESET",
        usedAt: null,
        id: { not: record.id },
      },
      data: { usedAt: new Date() },
    }),
  ])

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: record.userId,
    details: { type: "password_change", source: "reset_token" },
  })

  return { ok: true, message: t("actions.passwordReset.passwordChanged") }
}
