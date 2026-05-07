import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const sessions = await db.mobileSession.findMany({
    where: {
      userId: result.ctx.user.id,
      revokedAt: null,
      refreshExpiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      platform: true,
      appVersion: true,
      ip: true,
      expiresAt: true,
      refreshExpiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
    take: 20,
  })

  return NextResponse.json({ data: sessions })
}

export async function DELETE(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as { sessionId?: string } | null
  const sessionId = body?.sessionId?.trim()
  if (!sessionId) return mobileError("sessionId is required")

  await db.mobileSession.updateMany({
    where: {
      id: sessionId,
      userId: result.ctx.user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
