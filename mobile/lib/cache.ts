import { Directory, File, Paths } from "expo-file-system"

type CacheEnvelope<T> = {
  savedAt: string
  value: T
}

const CACHE_PREFIX = "commrent-mobile:"

export type CachedValue<T> = {
  value: T
  savedAt: string
}

export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  try {
    if (isWebRuntime()) {
      const raw = globalThis.localStorage?.getItem(cacheStorageKey(key))
      if (!raw) return null
      const parsed = JSON.parse(raw) as CacheEnvelope<T>
      if (!parsed || typeof parsed.savedAt !== "string" || !("value" in parsed)) return null
      return {
        value: parsed.value,
        savedAt: parsed.savedAt,
      }
    }

    const file = cacheFile(key)
    if (!file.exists) return null

    const raw = await file.text()
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (!parsed || typeof parsed.savedAt !== "string" || !("value" in parsed)) return null

    return {
      value: parsed.value,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

export async function writeCache<T>(key: string, value: T) {
  try {
    const envelope = JSON.stringify({ savedAt: new Date().toISOString(), value })
    if (isWebRuntime()) {
      globalThis.localStorage?.setItem(cacheStorageKey(key), envelope)
      return
    }

    cacheDirectory().create({ intermediates: true, idempotent: true })
    const file = cacheFile(key)
    file.create({ intermediates: true, overwrite: true })
    file.write(envelope)
  } catch {
    // Cache failures must never block the mobile cabinet.
  }
}

export async function removeCache(key: string) {
  try {
    if (isWebRuntime()) {
      globalThis.localStorage?.removeItem(cacheStorageKey(key))
      return
    }

    const file = cacheFile(key)
    if (file.exists) file.delete()
  } catch {}
}

export async function clearMobileCache() {
  try {
    if (isWebRuntime()) {
      for (let index = globalThis.localStorage.length - 1; index >= 0; index -= 1) {
        const key = globalThis.localStorage.key(index)
        if (key?.startsWith(CACHE_PREFIX)) globalThis.localStorage.removeItem(key)
      }
      return
    }

    const directory = cacheDirectory()
    if (directory.exists) directory.delete()
  } catch {}
}

function cacheFile(key: string) {
  const safeKey = key.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 90)
  return new File(cacheDirectory(), `${safeKey}.json`)
}

function cacheDirectory() {
  return new Directory(Paths.cache, "commrent-mobile")
}

function cacheStorageKey(key: string) {
  return `${CACHE_PREFIX}${key.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 90)}`
}

function isWebRuntime() {
  return process.env.EXPO_OS === "web"
}
