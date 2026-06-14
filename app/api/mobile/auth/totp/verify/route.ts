import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { encryptTotpSecret } from "@/lib/totp-secret"

export const dynamic = "force-dynamic"

const APP_NAME = "Commrent"

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = (await req.json().catch(() => null)) as {
    secret?: string
    code?: string
  } | null

  const secretBase32 = String(body?.secret ?? "").trim()
  const code = String(body?.code ?? "").replace(/\s+/g, "")
  if (!secretBase32) return mobileError("Секрет 2FA отсутствует")
  if (!/^[0-9]{6}$/.test(code)) return mobileError("Введите 6-значный код")

  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })
  if (totp.validate({ token: code, window: 1 }) === null) {
    return mobileError("Код неверный или просрочен")
  }

  const rawCodes: string[] = []
  for (let i = 0; i < 8; i++) {
    const buf = randomBytes(4).toString("hex").toUpperCase()
    rawCodes.push(`${buf.slice(0, 4)}-${buf.slice(4, 8)}`)
  }
  const hashed = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 8)))

  await db.user.update({
    where: { id: result.ctx.user.id },
    data: {
      totpSecret: encryptTotpSecret(secretBase32),
      totpEnabledAt: new Date(),
      totpBackupCodes: hashed,
    },
  })

  return NextResponse.json({ ok: true, backupCodes: rawCodes })
}
