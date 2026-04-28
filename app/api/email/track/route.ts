import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// 1×1 прозрачный GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

// GET /api/email/track?id=<emailLogId>
// Возвращает 1×1 пиксель и помечает письмо как открытое
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (id) {
    try {
      await db.emailLog.update({
        where: { id },
        data: {
          status: "OPENED",
          openedAt: new Date(),
          openCount: { increment: 1 },
        },
      })
    } catch {
      // Игнорируем ошибку если письмо не найдено или таблица отсутствует
    }
  }

  return new NextResponse(PIXEL as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Content-Length": String(PIXEL.length),
    },
  })
}
