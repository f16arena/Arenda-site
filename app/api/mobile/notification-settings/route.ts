import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { MOBILE_NOTIFICATION_TYPES, normalizeMutedTypes } from "@/lib/notification-preferences"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const [user, devices] = await Promise.all([
    db.user.findUnique({
      where: { id: result.ctx.user.id },
      select: {
        notifyEmail: true,
        notifyTelegram: true,
        notifyInApp: true,
        notifySms: true,
        notifyQuietHoursEnabled: true,
        notifyQuietFrom: true,
        notifyQuietTo: true,
        notifyMutedTypes: true,
      },
    }),
    db.pushDevice.findMany({
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
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
    }),
  ])

  if (!user) return mobileError("User not found", 404)

  return NextResponse.json({
    settings: {
      notifyEmail: user.notifyEmail,
      notifyTelegram: user.notifyTelegram,
      notifyInApp: user.notifyInApp,
      notifySms: user.notifySms,
      quietHoursEnabled: user.notifyQuietHoursEnabled,
      quietFrom: user.notifyQuietFrom,
      quietTo: user.notifyQuietTo,
      mutedTypes: normalizeMutedTypes(user.notifyMutedTypes),
      eventTypes: MOBILE_NOTIFICATION_TYPES,
    },
    devices,
  })
}

export async function PATCH(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    notifyEmail?: boolean
    notifyTelegram?: boolean
    notifyInApp?: boolean
    notifySms?: boolean
    quietHoursEnabled?: boolean
    quietFrom?: string
    quietTo?: string
    mutedTypes?: unknown
  } | null

  if (!body || typeof body !== "object") return mobileError("Invalid payload")

  const data: {
    notifyEmail?: boolean
    notifyTelegram?: boolean
    notifyInApp?: boolean
    notifySms?: boolean
    notifyQuietHoursEnabled?: boolean
    notifyQuietFrom?: string
    notifyQuietTo?: string
    notifyMutedTypes?: string[]
  } = {}

  if (typeof body.notifyEmail === "boolean") data.notifyEmail = body.notifyEmail
  if (typeof body.notifyTelegram === "boolean") data.notifyTelegram = body.notifyTelegram
  if (typeof body.notifyInApp === "boolean") data.notifyInApp = body.notifyInApp
  if (typeof body.notifySms === "boolean") data.notifySms = body.notifySms
  if (typeof body.quietHoursEnabled === "boolean") data.notifyQuietHoursEnabled = body.quietHoursEnabled
  if (typeof body.quietFrom === "string" && isClockValue(body.quietFrom)) data.notifyQuietFrom = body.quietFrom
  if (typeof body.quietTo === "string" && isClockValue(body.quietTo)) data.notifyQuietTo = body.quietTo
  if ("mutedTypes" in body) data.notifyMutedTypes = normalizeMutedTypes(body.mutedTypes)

  const updated = await db.user.update({
    where: { id: result.ctx.user.id },
    data,
    select: {
      notifyEmail: true,
      notifyTelegram: true,
      notifyInApp: true,
      notifySms: true,
      notifyQuietHoursEnabled: true,
      notifyQuietFrom: true,
      notifyQuietTo: true,
      notifyMutedTypes: true,
    },
  })

  return NextResponse.json({
    settings: {
      notifyEmail: updated.notifyEmail,
      notifyTelegram: updated.notifyTelegram,
      notifyInApp: updated.notifyInApp,
      notifySms: updated.notifySms,
      quietHoursEnabled: updated.notifyQuietHoursEnabled,
      quietFrom: updated.notifyQuietFrom,
      quietTo: updated.notifyQuietTo,
      mutedTypes: normalizeMutedTypes(updated.notifyMutedTypes),
      eventTypes: MOBILE_NOTIFICATION_TYPES,
    },
  })
}

function isClockValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
