"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath, revalidateTag } from "next/cache"
import { headers } from "next/headers"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import { normalizeEmailWithDns } from "@/lib/contact-validation"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import { audit } from "@/lib/audit"
import { getT, getTForUser } from "@/lib/i18n/server"

export interface ResultOk { ok: true; message?: string }
export interface ResultError { ok: false; error: string }
export type Result = ResultOk | ResultError

/**
 * Сменить пароль текущему пользователю.
 * Требует ввода старого пароля.
 */
export async function changeMyPassword(formData: FormData): Promise<Result> {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user) return { ok: false, error: t("actions.auth.notAuthorized") }

  const oldPassword = String(formData.get("oldPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!oldPassword) return { ok: false, error: t("actions.myAccount.enterCurrentPassword") }
  if (newPassword.length < 8) return { ok: false, error: t("actions.myAccount.newPasswordTooShort") }
  if (newPassword !== confirmPassword) return { ok: false, error: t("actions.myAccount.passwordsMismatch") }
  if (newPassword === oldPassword) return { ok: false, error: t("actions.myAccount.newPasswordSameAsOld") }

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { password: true } })
  if (!user) return { ok: false, error: t("actions.common.userNotFound") }

  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) return { ok: false, error: t("actions.myAccount.currentPasswordWrong") }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({ where: { id: session.user.id }, data: { password: hash } })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: session.user.id,
    details: { type: "password_change", source: "self" },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/superadmin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true, message: t("actions.myAccount.passwordChanged") }
}

/**
 * Сменить имя.
 */
export async function changeMyName(formData: FormData): Promise<Result> {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user) return { ok: false, error: t("actions.auth.notAuthorized") }
  const name = String(formData.get("name") ?? "").trim()
  if (name.length < 2) return { ok: false, error: t("actions.myAccount.nameTooShort") }

  await db.user.update({ where: { id: session.user.id }, data: { name } })
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin", "layout")
  revalidatePath("/admin/profile")
  revalidatePath("/superadmin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true, message: t("actions.myAccount.nameUpdated") }
}

/**
 * Запросить смену email — генерирует токен и отправляет письмо
 * на новый адрес. Реальное обновление email произойдёт при переходе по ссылке.
 */
export async function requestEmailChange(formData: FormData): Promise<Result & { previewLink?: string }> {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user) return { ok: false, error: t("actions.auth.notAuthorized") }

  let newEmail: string
  try {
    newEmail = await normalizeEmailWithDns(formData.get("newEmail"), { required: true, t })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t("actions.myAccount.invalidEmail") }
  }

  const conflict = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } })
  if (conflict && conflict.id !== session.user.id) {
    return { ok: false, error: t("actions.myAccount.emailTaken") }
  }

  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)

  await db.verificationToken.create({
    data: {
      userId: session.user.id,
      type: "EMAIL_CHANGE",
      target: newEmail,
      token,
      expiresAt,
    },
  })

  const h = await headers()
  const host = h.get("host") ?? "commrent.kz"
  const proto = h.get("x-forwarded-proto") ?? "https"
  const link = `${proto}://${host}/verify-email?token=${token}`

  // Письмо читает сам владелец аккаунта — язык берём из его профиля.
  const { t: tMail } = await getTForUser(session.user.id)

  // Пытаемся отправить письмо
  const html = basicEmailTemplate({
    title: tMail("actions.myAccount.mailChangeTitle"),
    body: `<p>${tMail("actions.myAccount.mailGreeting", { name: session.user.name ?? "" })}</p>
<p>${tMail("actions.myAccount.mailChangeLead", { email: newEmail })}</p>
<p>${tMail("actions.myAccount.mailChangeAction")}</p>`,
    buttonText: tMail("actions.myAccount.mailConfirmButton"),
    buttonUrl: link,
    footer: tMail("actions.myAccount.mailChangeFooter"),
  })

  const emailResult = await sendEmail({
    to: newEmail,
    subject: tMail("actions.myAccount.mailChangeSubject"),
    html,
    text: tMail("actions.myAccount.mailChangeText", { link }),
  })

  // Если Resend не настроен — возвращаем ссылку прямо в UI
  if (!emailResult.ok) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] email change delivery failed", emailResult.error)
      return {
        ok: true,
        message: t("actions.myAccount.mailSentConfirm", { email: newEmail }),
      }
    }

    return {
      ok: true,
      message: t("actions.myAccount.mailNotConfiguredConfirm"),
      previewLink: link,
    }
  }

  return { ok: true, message: t("actions.myAccount.mailSentConfirm", { email: newEmail }) }
}

/**
 * Подтвердить смену email по токену (используется на /verify-email).
 */
export async function confirmEmailChange(token: string): Promise<Result> {
  const { t } = await getT()
  // vt, а не t: переменная с токеном раньше перекрывала переводчик.
  const vt = await db.verificationToken.findUnique({ where: { token } })
  if (!vt) return { ok: false, error: t("actions.myAccount.tokenNotFound") }
  if (vt.usedAt) return { ok: false, error: t("actions.myAccount.linkAlreadyUsed") }
  if (vt.expiresAt < new Date()) return { ok: false, error: t("actions.myAccount.linkExpired") }
  if (vt.type !== "EMAIL_CHANGE" && vt.type !== "EMAIL_VERIFY") return { ok: false, error: t("actions.myAccount.tokenWrongType") }
  if (!vt.userId) return { ok: false, error: t("actions.myAccount.tokenNoUser") }

  // Проверка что email всё ещё свободен
  const conflict = await db.user.findUnique({ where: { email: vt.target }, select: { id: true } })
  if (conflict && conflict.id !== vt.userId) {
    return { ok: false, error: t("actions.myAccount.emailTakenMeanwhile") }
  }

  try {
    await db.user.update({
      where: { id: vt.userId },
      data: { email: vt.target, emailVerifiedAt: new Date() },
    })
    await db.verificationToken.update({
      where: { id: vt.id },
      data: { usedAt: new Date() },
    })
  } catch {
    // Гонка (email заняли между проверкой и записью) или транзиентный сбой БД —
    // возвращаем мягкую ошибку, а не роняем рендер страницы /verify-email.
    return { ok: false, error: t("actions.myAccount.emailTakenOrFailed") }
  }

  // Сброс кэша админ-оболочки. confirmEmailChange вызывается СТРАНИЦЕЙ
  // /verify-email во время рендера Server Component (переход по ссылке из письма),
  // а revalidateTag во время рендера запрещён Next и роняет страницу в 500.
  // Email уже обновлён выше — кэш-хинт некритичен, оборачиваем, чтобы рендер не падал
  // (кэш всё равно истечёт по TTL/следующей навигации).
  try {
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  } catch { /* вызвано во время рендера — игнорируем, не роняем подтверждение */ }
  return { ok: true, message: t("actions.myAccount.emailConfirmed") }
}

/**
 * Отправить письмо для верификации текущего email (если он не подтверждён).
 */
export async function requestEmailVerification(): Promise<Result & { previewLink?: string }> {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user) return { ok: false, error: t("actions.auth.notAuthorized") }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, emailVerifiedAt: true },
  })
  if (!user || !user.email) return { ok: false, error: t("actions.myAccount.noEmailOnAccount") }
  if (user.emailVerifiedAt) return { ok: false, error: t("actions.myAccount.emailAlreadyVerified") }

  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000)

  await db.verificationToken.create({
    data: {
      userId: session.user.id,
      type: "EMAIL_VERIFY",
      target: user.email,
      token,
      expiresAt,
    },
  })

  const h = await headers()
  const host = h.get("host") ?? "commrent.kz"
  const proto = h.get("x-forwarded-proto") ?? "https"
  const link = `${proto}://${host}/verify-email?token=${token}`

  // Письмо читает сам владелец аккаунта — язык берём из его профиля.
  const { t: tMail } = await getTForUser(session.user.id)

  const html = basicEmailTemplate({
    title: tMail("actions.myAccount.mailVerifyTitle"),
    body: `<p>${tMail("actions.myAccount.mailGreeting", { name: user.name ?? "" })}</p>
<p>${tMail("actions.myAccount.mailVerifyLead")}</p>`,
    buttonText: tMail("actions.myAccount.mailConfirmButton"),
    buttonUrl: link,
  })

  const emailResult = await sendEmail({
    to: user.email,
    subject: tMail("actions.myAccount.mailVerifySubject"),
    html,
    text: tMail("actions.myAccount.mailVerifyText", { link }),
  })

  if (!emailResult.ok) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] email verification delivery failed", emailResult.error)
      return { ok: true, message: t("actions.myAccount.mailSent", { email: user.email }) }
    }

    return {
      ok: true,
      message: t("actions.myAccount.mailNotConfigured"),
      previewLink: link,
    }
  }

  return { ok: true, message: t("actions.myAccount.mailSent", { email: user.email }) }
}
