import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const botName = process.env.TELEGRAM_BOT_NAME ?? process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME
  if (!botName) return mobileError("Бот не настроен. Свяжитесь с администратором платформы.", 503)

  const token = randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 10 * 60_000)

  await db.verificationToken.create({
    data: {
      userId: result.ctx.user.id,
      type: "TELEGRAM_CONNECT",
      target: "telegram",
      token,
      expiresAt,
    },
  })

  return NextResponse.json({
    url: `https://t.me/${botName}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  })
}

export async function DELETE(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  await db.user.update({
    where: { id: result.ctx.user.id },
    data: { telegramChatId: null },
  })

  return NextResponse.json({ ok: true })
}
