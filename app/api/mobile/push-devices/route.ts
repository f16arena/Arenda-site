import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { isExpoPushToken } from "@/lib/push"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const devices = await db.pushDevice.findMany({
    where: {
      userId: result.ctx.user.id,
      isActive: true,
      revokedAt: null,
    },
    select: {
      id: true,
      provider: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      locale: true,
      timezone: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  })

  return NextResponse.json({ data: devices })
}

export async function POST(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    token?: string
    provider?: string
    platform?: string
    deviceName?: string
    appVersion?: string
    locale?: string
    timezone?: string
  } | null

  const provider = (body?.provider ?? "EXPO").trim().toUpperCase()
  const token = body?.token?.trim()
  const platform = body?.platform?.trim().toUpperCase()

  if (!token || token.length > 300) return mobileError("Invalid push token")
  if (provider !== "EXPO") return mobileError("Unsupported push provider")
  if (!isExpoPushToken(token)) return mobileError("Invalid Expo push token")
  if (!platform || !["IOS", "ANDROID", "IPADOS"].includes(platform)) {
    return mobileError("Invalid device platform")
  }

  const device = await db.pushDevice.upsert({
    where: { provider_token: { provider, token } },
    update: {
      userId: result.ctx.user.id,
      organizationId: result.ctx.org.id,
      platform,
      deviceName: body?.deviceName?.trim().slice(0, 120) || null,
      appVersion: body?.appVersion?.trim().slice(0, 40) || null,
      locale: body?.locale?.trim().slice(0, 20) || null,
      timezone: body?.timezone?.trim().slice(0, 80) || null,
      isActive: true,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: result.ctx.user.id,
      organizationId: result.ctx.org.id,
      provider,
      token,
      platform,
      deviceName: body?.deviceName?.trim().slice(0, 120) || null,
      appVersion: body?.appVersion?.trim().slice(0, 40) || null,
      locale: body?.locale?.trim().slice(0, 20) || null,
      timezone: body?.timezone?.trim().slice(0, 80) || null,
      isActive: true,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      provider: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      lastSeenAt: true,
    },
  })

  return NextResponse.json({ data: device })
}

export async function DELETE(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as { token?: string } | null
  const token = body?.token?.trim()
  if (!token) return mobileError("Token is required")

  await db.pushDevice.updateMany({
    where: {
      userId: result.ctx.user.id,
      token,
    },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
