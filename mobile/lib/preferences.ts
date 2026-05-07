import { readCache, writeCache } from "@/lib/cache"

export type LocalPushPreferences = {
  quietHoursEnabled: boolean
  quietFrom: string
  quietTo: string
}

const DEFAULT_PUSH_PREFERENCES: LocalPushPreferences = {
  quietHoursEnabled: false,
  quietFrom: "22:00",
  quietTo: "08:00",
}

const PUSH_PREFERENCES_KEY = "push-preferences"

export async function getLocalPushPreferences() {
  const cached = await readCache<LocalPushPreferences>(PUSH_PREFERENCES_KEY)
  return {
    ...DEFAULT_PUSH_PREFERENCES,
    ...(cached?.value ?? {}),
  }
}

export async function saveLocalPushPreferences(preferences: LocalPushPreferences) {
  await writeCache(PUSH_PREFERENCES_KEY, preferences)
  return preferences
}

export function isQuietHoursNow(preferences: LocalPushPreferences, date = new Date()) {
  if (!preferences.quietHoursEnabled) return false

  const current = date.getHours() * 60 + date.getMinutes()
  const from = parseClock(preferences.quietFrom)
  const to = parseClock(preferences.quietTo)
  if (from === to) return false

  return from < to
    ? current >= from && current < to
    : current >= from || current < to
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return Math.min(23, Math.max(0, hours)) * 60 + Math.min(59, Math.max(0, minutes))
}
