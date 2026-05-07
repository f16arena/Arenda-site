"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { PasswordChangeSchema, firstZodError } from "@/lib/schemas"
import bcrypt from "bcryptjs"
import type { Result } from "./my-account"

/**
 * Смена собственного пароля авторизованным пользователем.
 * Требует ввода текущего пароля для подтверждения личности
 * (защита от хайджака сессии).
 *
 * При первом входе со стартовым паролем используется тем же экраном,
 * но текущий пароль = стартовый, выданный администратором.
 *
 * Сбрасывает флаг mustChangePassword.
 */
export async function changeOwnPassword(formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, error: "Вы не авторизованы" }
  }

  // Rate limit: 10 попыток за 10 минут — защита от brute-force текущего пароля
  const reqHeaders = await headers()
  const rl = checkRateLimit(getClientKey(reqHeaders, `pwd-change:${session.user.id}`), {
    max: 10,
    window: 10 * 60_000,
  })
  if (!rl.ok) {
    return {
      ok: false,
      error: `Слишком много попыток. Попробуйте через ${Math.ceil(rl.retryAfterSec / 60)} мин.`,
    }
  }

  const parsed = PasswordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  })
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) }
  }
  const { currentPassword, newPassword } = parsed.data

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  })
  if (!user) return { ok: false, error: "Пользователь не найден" }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return { ok: false, error: "Текущий пароль неверный" }

  const newHash = await bcrypt.hash(newPassword, 10)
  await db.user.update({
    where: { id: user.id },
    data: {
      password: newHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  })

  return { ok: true, message: "Пароль успешно изменён" }
}
