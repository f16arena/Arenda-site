import { NextResponse } from "next/server"
import * as OTPAuth from "otpauth"
import QRCode from "qrcode"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

const APP_NAME = "Commrent"

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const user = await db.user.findUnique({
    where: { id: result.ctx.user.id },
    select: { email: true, phone: true, name: true, totpEnabledAt: true },
  })
  if (!user) return mobileError("Пользователь не найден", 404)
  if (user.totpEnabledAt) return mobileError("2FA уже включена", 409)

  const label = user.email ?? user.phone ?? user.name
  const secret = new OTPAuth.Secret({ size: 20 })
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

  return NextResponse.json({
    secret: secret.base32,
    otpauthUrl,
    qrDataUrl,
  })
}
