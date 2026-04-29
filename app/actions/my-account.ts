"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { sendEmail, basicEmailTemplate } from "@/lib/email"
import bcrypt from "bcryptjs"
import crypto from "crypto"

export interface ResultOk { ok: true; message?: string }
export interface ResultError { ok: false; error: string }
export type Result = ResultOk | ResultError

/**
 * Сменить пароль текущему пользователю.
 * Требует ввода старого пароля.
 */
export async function changeMyPassword(formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const oldPassword = String(formData.get("oldPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!oldPassword) return { ok: false, error: "Введите текущий пароль" }
  if (newPassword.length < 8) return { ok: false, error: "Новый пароль минимум 8 символов" }
  if (newPassword !== confirmPassword) return { ok: false, error: "Пароли не совпадают" }
  if (newPassword === oldPassword) return { ok: false, error: "Новый пароль совпадает со старым" }

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { password: true } })
  if (!user) return { ok: false, error: "Пользователь не найден" }

  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) return { ok: false, error: "Текущий пароль неверный" }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({ where: { id: session.user.id }, data: { password: hash } })

  revalidatePath("/admin/profile")
  revalidatePath("/superadmin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true, message: "Пароль изменён" }
}

/**
 * Сменить имя.
 */
export async function changeMyName(formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const name = String(formData.get("name") ?? "").trim()
  if (name.length < 2) return { ok: false, error: "Имя минимум 2 символа" }

  await db.user.update({ where: { id: session.user.id }, data: { name } })
  revalidatePath("/admin/profile")
  revalidatePath("/superadmin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true, message: "Имя обновлено" }
}

/**
 * Запросить смену email — генерирует токен и отправляет письмо
 * на новый адрес. Реальное обновление email произойдёт при переходе по ссылке.
 */
export async function requestEmailChange(formData: FormData): Promise<Result & { previewLink?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase()
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { ok: false, error: "Введите корректный email" }
  }

  const conflict = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } })
  if (conflict && conflict.id !== session.user.id) {
    return { ok: false, error: "Email уже используется другим пользователем" }
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

  // Пытаемся отправить письмо
  const html = basicEmailTemplate({
    title: "Подтверждение смены email",
    body: `<p>Здравствуйте, ${session.user.name}!</p>
<p>Вы запросили смену email на адрес <b>${newEmail}</b>.</p>
<p>Для подтверждения перейдите по ссылке (действительна 24 часа):</p>`,
    buttonText: "Подтвердить email",
    buttonUrl: link,
    footer: "Если вы не запрашивали смену — проигнорируйте это письмо.",
  })

  const emailResult = await sendEmail({
    to: newEmail,
    subject: "Подтверждение смены email на Commrent",
    html,
    text: `Перейдите по ссылке для подтверждения: ${link}`,
  })

  // Если Resend не настроен — возвращаем ссылку прямо в UI
  if (!emailResult.ok) {
    return {
      ok: true,
      message: `Email-отправка пока не настроена. Скопируйте ссылку для подтверждения вручную:`,
      previewLink: link,
    }
  }

  return { ok: true, message: `Письмо отправлено на ${newEmail}. Перейдите по ссылке в письме для подтверждения.` }
}

/**
 * Подтвердить смену email по токену (используется на /verify-email).
 */
export async function confirmEmailChange(token: string): Promise<Result> {
  const t = await db.verificationToken.findUnique({ where: { token } })
  if (!t) return { ok: false, error: "Токен не найден" }
  if (t.usedAt) return { ok: false, error: "Ссылка уже использована" }
  if (t.expiresAt < new Date()) return { ok: false, error: "Срок действия ссылки истёк" }
  if (t.type !== "EMAIL_CHANGE" && t.type !== "EMAIL_VERIFY") return { ok: false, error: "Неверный тип токена" }
  if (!t.userId) return { ok: false, error: "Токен не привязан к пользователю" }

  // Проверка что email всё ещё свободен
  const conflict = await db.user.findUnique({ where: { email: t.target }, select: { id: true } })
  if (conflict && conflict.id !== t.userId) {
    return { ok: false, error: "Email тем временем занят другим пользователем" }
  }

  await db.user.update({
    where: { id: t.userId },
    data: { email: t.target, emailVerifiedAt: new Date() },
  })
  await db.verificationToken.update({
    where: { id: t.id },
    data: { usedAt: new Date() },
  })

  return { ok: true, message: "Email подтверждён и обновлён" }
}

/**
 * Отправить письмо для верификации текущего email (если он не подтверждён).
 */
export async function requestEmailVerification(): Promise<Result & { previewLink?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, emailVerifiedAt: true },
  })
  if (!user || !user.email) return { ok: false, error: "У аккаунта нет email" }
  if (user.emailVerifiedAt) return { ok: false, error: "Email уже подтверждён" }

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

  const html = basicEmailTemplate({
    title: "Подтверждение email",
    body: `<p>Здравствуйте, ${user.name}!</p>
<p>Подтвердите свой email для аккаунта в Commrent. Ссылка действует 24 часа.</p>`,
    buttonText: "Подтвердить email",
    buttonUrl: link,
  })

  const emailResult = await sendEmail({
    to: user.email,
    subject: "Подтвердите email для Commrent",
    html,
    text: `Перейдите по ссылке: ${link}`,
  })

  if (!emailResult.ok) {
    return {
      ok: true,
      message: "Email-отправка пока не настроена. Используйте ссылку:",
      previewLink: link,
    }
  }

  return { ok: true, message: `Письмо отправлено на ${user.email}` }
}
