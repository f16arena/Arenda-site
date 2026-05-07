import { NextResponse } from "next/server"
import {
  getRequestMeta,
  MobileAuthError,
  refreshMobileSession,
} from "@/lib/mobile-auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    refreshToken?: string
    deviceId?: string
    deviceName?: string
    platform?: string
    appVersion?: string
  } | null

  if (!body?.refreshToken) {
    return NextResponse.json({ error: "Refresh token is required" }, { status: 400 })
  }

  try {
    const result = await refreshMobileSession(body.refreshToken, {
      ...getRequestMeta(req),
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      platform: body.platform,
      appVersion: body.appVersion,
    })

    return NextResponse.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        organizationId: result.user.organizationId,
      },
      tokens: result.tokens,
    })
  } catch (e) {
    if (e instanceof MobileAuthError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      )
    }
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 })
  }
}
