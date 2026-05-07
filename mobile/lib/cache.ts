import { Directory, File, Paths } from "expo-file-system"

type CacheEnvelope<T> = {
  savedAt: string
  value: T
}

const cacheDirectory = new Directory(Paths.cache, "commrent-mobile")

export type CachedValue<T> = {
  value: T
  savedAt: string
}

export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  try {
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
    cacheDirectory.create({ intermediates: true, idempotent: true })
    const file = cacheFile(key)
    file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify({ savedAt: new Date().toISOString(), value }))
  } catch {
    // Cache failures must never block the mobile cabinet.
  }
}

export async function removeCache(key: string) {
  try {
    const file = cacheFile(key)
    if (file.exists) file.delete()
  } catch {}
}

export async function clearMobileCache() {
  try {
    if (cacheDirectory.exists) cacheDirectory.delete()
  } catch {}
}

function cacheFile(key: string) {
  const safeKey = key.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 90)
  return new File(cacheDirectory, `${safeKey}.json`)
}
