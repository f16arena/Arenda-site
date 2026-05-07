import { NextResponse } from "next/server"
import {
  createMobileSession,
  getRequestMeta,
  MobileAuthError,
  verifyMobileCredentials,
} from "@/lib/mobile-auth"
import {
  checkMobileAuthRateLimit,
  clearMobileAuthFailures,
  recordMobileAuthFailure,
} from "@/lib/mobile-rate-limit"

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

  const rateLimitKey = getRateLimitKey(req, body.login)
  const rateLimit = checkMobileAuthRateLimit(rateLimitKey)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many login attempts", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    )
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

    clearMobileAuthFailures(rateLimitKey)

    return NextResponse.json({
      user: publicUser(user),
      tokens,
    })
  } catch (e) {
    recordMobileAuthFailure(rateLimitKey)
    if (e instanceof MobileAuthError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      )
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}

function getRateLimitKey(req: Request, login: string) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwardedFor || req.headers.get("x-real-ip") || "unknown"
  return `${ip}:${login.trim().toLowerCase()}`
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
