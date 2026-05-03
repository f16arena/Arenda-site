export function formatErrorId(digest?: string | null): string {
  const source = digest?.trim() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  let hash = 2166136261

  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 8)
}
