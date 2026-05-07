import { NextResponse } from "next/server"
import {
  createMobileSession,
  getRequestMeta,
  MobileAuthError,
  verifyMobileCredentials,
} from "@/lib/mobile-auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    login?: string
    password?: string
    totp?: string
    deviceId?: string
    deviceName?: string
    platform?: string
    appVersion?: string
  } | null

  if (!body?.login || !body?.password) {
    return NextResponse.json({ error: "Login and password are required" }, { status: 400 })
  }

  try {
    const user = await verifyMobileCredentials({
      login: body.login,
      password: body.password,
      totp: body.totp,
    })
    const tokens = await createMobileSession(user, {
      ...getRequestMeta(req),
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      platform: body.platform,
      appVersion: body.appVersion,
    })

    return NextResponse.json({
      user: publicUser(user),
      tokens,
    })
  } catch (e) {
    if (e instanceof MobileAuthError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      )
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}

function publicUser(user: {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  organizationId: string
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    organizationId: user.organizationId,
  }
}
