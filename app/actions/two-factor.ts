"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import * as OTPAuth from "otpauth"
import QRCode from "qrcode"
import bcrypt from "bcryptjs"

const APP_NAME = "Commrent"

/**
 * Генерирует новый TOTP-секрет и возвращает URI/QR для прикрепления к
 * приложению-аутентификатору. Секрет НЕ сохраняется в БД до подтверждения
 * (verifyAndEnableTotp).
 */
export async function startTotpEnrollment(): Promise<{
  ok: true
  secret: string
  qrDataUrl: string
  otpauthUrl: string
} | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, phone: true, name: true, totpEnabledAt: true },
  })
  if (!user) return { ok: false, error: "Пользователь не найден" }
  if (user.totpEnabledAt) return { ok: false, error: "2FA уже включена" }

  const label = user.email ?? user.phone ?? user.name
  const secret = new OTPAuth.Secret({ size: 20 })  // 160 бит
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  })
  const otpauthUrl = totp.toString()
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 })

  return {
    ok: true,
    secret: secret.base32,
    qrDataUrl,
    otpauthUrl,
  }
}

/**
 * Проверить код из приложения и включить 2FA: сохранить секрет + сгенерировать
 * 8 одноразовых резервных кодов (показываются один раз пользователю).
 */
export async function verifyAndEnableTotp(
  secretBase32: string,
  code: string,
): Promise<{ ok: true; backupCodes: string[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const cleaned = code.replace(/\s+/g, "")
  if (!/^[0-9]{6}$/.test(cleaned)) return { ok: false, error: "Введите 6-значный код" }

  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })
  const delta = totp.validate({ token: cleaned, window: 1 })
  if (delta === null) return { ok: false, error: "Код неверный или просрочен" }

  // Генерируем 8 резервных кодов вида XXXX-XXXX
  const { randomBytes } = await import("crypto")
  const rawCodes: string[] = []
  for (let i = 0; i < 8; i++) {
    const buf = randomBytes(4).toString("hex").toUpperCase()
    rawCodes.push(`${buf.slice(0, 4)}-${buf.slice(4, 8)}`)
  }
  const hashed = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 8)))

  await db.user.update({
    where: { id: session.user.id },
    data: {
      totpSecret: secretBase32,
      totpEnabledAt: new Date(),
      totpBackupCodes: hashed,
    },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true, backupCodes: rawCodes }
}

/**
 * Отключить 2FA. Требует подтверждение паролем.
 */
export async function disableTotp(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, totpEnabledAt: true },
  })
  if (!user) return { ok: false, error: "Пользователь не найден" }
  if (!user.totpEnabledAt) return { ok: false, error: "2FA не была включена" }

  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return { ok: false, error: "Пароль неверный" }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpBackupCodes: undefined,
    },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
  return { ok: true }
}

/**
 * Проверить TOTP-код или резервный код пользователя при входе.
 * Используется в auth flow.
 */
export async function verifyTotpForLogin(userId: string, code: string): Promise<boolean> {
  const cleaned = code.replace(/[\s-]/g, "")
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpBackupCodes: true },
  })
  if (!user || !user.totpSecret || !user.totpEnabledAt) return false

  // Сначала пробуем как TOTP (6 цифр)
  if (/^[0-9]{6}$/.test(cleaned)) {
    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    })
    if (totp.validate({ token: cleaned, window: 1 }) !== null) return true
  }

  // Потом пробуем как backup-код XXXX-XXXX (8 hex с дефисом)
  const backups = (user.totpBackupCodes as unknown as string[] | null) ?? []
  if (Array.isArray(backups)) {
    for (let i = 0; i < backups.length; i++) {
      const matches = await bcrypt.compare(code.toUpperCase(), backups[i])
      if (matches) {
        // Сжигаем код — больше не повторно
        const remaining = [...backups.slice(0, i), ...backups.slice(i + 1)]
        await db.user.update({
          where: { id: userId },
          data: { totpBackupCodes: remaining },
        })
        return true
      }
    }
  }

  return false
}
