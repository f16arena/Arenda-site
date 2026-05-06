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
}

export function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token)
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const devices = await safeServerValue<PushDeviceRow[]>(
    db.pushDevice.findMany({
      where: {
        userId,
        provider: "EXPO",
        isActive: true,
        revokedAt: null,
      },
      select: { id: true, token: true },
    }),
    [],
    {
      source: "push.devices.lookup",
      route: "/server/push",
      userId,
      entity: "pushDevice",
      extra: { provider: "EXPO", activeOnly: true },
    },
  )

  const messages = devices
    .filter((device) => isExpoPushToken(device.token))
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
