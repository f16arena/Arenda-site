import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"

type PushPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
}

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
  priority?: "default" | "normal" | "high"
}

type PushDeviceRow = {
  id: string
  token: string
  timezone?: string | null
}

export function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token)
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const [user, devices] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        notifyQuietHoursEnabled: true,
        notifyQuietFrom: true,
        notifyQuietTo: true,
      },
    }).catch(() => null),
    safeServerValue<PushDeviceRow[]>(
      db.pushDevice.findMany({
        where: {
          userId,
          provider: "EXPO",
          isActive: true,
          revokedAt: null,
        },
        select: { id: true, token: true, timezone: true },
      }),
      [],
      {
        source: "push.devices.lookup",
        route: "/server/push",
        userId,
        entity: "pushDevice",
        extra: { provider: "EXPO", activeOnly: true },
      },
    ),
  ])

  const messages = devices
    .filter((device) => isExpoPushToken(device.token))
    .filter((device) => !isQuietHoursForDevice({
      enabled: user?.notifyQuietHoursEnabled ?? false,
      from: user?.notifyQuietFrom ?? "22:00",
      to: user?.notifyQuietTo ?? "08:00",
      timezone: device.timezone,
    }))
    .map((device): ExpoPushMessage => ({
      to: device.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound ?? "default",
      priority: "high",
    }))

  if (messages.length === 0) return { sent: 0, failed: 0 }
  return sendExpoPushMessages(messages)
}

function isQuietHoursForDevice(input: {
  enabled: boolean
  from: string
  to: string
  timezone?: string | null
}) {
  if (!input.enabled) return false

  const current = minutesNow(input.timezone)
  const from = parseClock(input.from)
  const to = parseClock(input.to)
  if (from === to) return false

  return from < to
    ? current >= from && current < to
    : current >= from || current < to
}

function minutesNow(timezone?: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "Asia/Qyzylorda",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date())

    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0")
    return hour * 60 + minute
  } catch {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return Math.min(23, Math.max(0, hours)) * 60 + Math.min(59, Math.max(0, minutes))
}

async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  let sent = 0
  let failed = 0

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        failed += chunk.length
        continue
      }
      sent += chunk.length
    } catch (e) {
      console.warn("[push] expo send failed:", e instanceof Error ? e.message : e)
      failed += chunk.length
    }
  }

  return { sent, failed }
}
