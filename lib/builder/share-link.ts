// Публичная ссылка-витрина: одна проверка на все входы (страница витрины и приём
// заявки). Ссылка действует, пока её не отозвали и пока не вышел срок.

export interface ShareLink {
  revokedAt?: Date | string | null
  expiresAt?: Date | string | null
}

export function shareLinkValid<T extends ShareLink>(share: T | null | undefined, now: Date = new Date()): share is T {
  if (!share) return false
  if (share.revokedAt) return false
  if (!share.expiresAt) return true
  const till = share.expiresAt instanceof Date ? share.expiresAt : new Date(share.expiresAt)
  return Number.isFinite(till.getTime()) && till.getTime() > now.getTime()
}
