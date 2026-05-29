import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  revokeMobileSessionByBearer,
  revokeMobileSessionByRefresh,
} from "@/lib/mobile-auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { refreshToken?: string; pushToken?: string } | null

  await revokeMobileSessionByBearer(req)
  if (body?.refreshToken) await revokeMobileSessionByRefresh(body.refreshToken)

  // Ревокаем push-девайс этого токена при выходе — иначе уведомления юзера
  // (с payment/tenant ID в payload) продолжают идти на устройство, пока на нём
  // не перерегистрируется другой юзер (см. AUDIT_2026-05-29, пункт A).
  // Клиент должен слать свой Expo pushToken в теле logout-запроса.
  const pushToken = body?.pushToken?.trim()
  if (pushToken) {
    await db.pushDevice.updateMany({
      where: { token: pushToken },
      data: { isActive: false, revokedAt: new Date() },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
