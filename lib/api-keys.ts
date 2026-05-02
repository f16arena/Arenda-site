// API-ключи для внешних интеграций.
//
// Формат токена: ck_<random32>
// Хранение: bcrypt-хеш + первые 8 символов для отображения списка.
//
// Использование клиентом: заголовок Authorization: Bearer ck_xxx...
// либо параметр ?api_key=ck_xxx... в URL.

import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"

export const API_KEY_PREFIX = "ck_"

export type ApiKeyScope = "READ" | "WRITE"

export type ApiKeyAuth = {
  organizationId: string
  scope: ApiKeyScope
  apiKeyId: string
}

/**
 * Сгенерировать новый ключ. Возвращает plain-токен (показывается ОДИН РАЗ).
 */
export function generateApiKeyToken(): { token: string; prefix: string } {
  const random = randomBytes(24).toString("base64url")
  const token = `${API_KEY_PREFIX}${random}`
  return { token, prefix: token.slice(0, 8) }
}

/**
 * Аутентификация по запросу. Извлекает токен из Authorization Bearer
 * либо из query-параметра api_key. Проверяет bcrypt + revoked + expired.
 * Помечает lastUsedAt.
 */
export async function authenticateApiKey(req: Request): Promise<ApiKeyAuth | null> {
  let token: string | null = null
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7).trim()
  } else {
    const url = new URL(req.url)
    token = url.searchParams.get("api_key")
  }
  if (!token || !token.startsWith(API_KEY_PREFIX) || token.length < 20) return null

  const prefix = token.slice(0, 8)
  // Тащим все ключи с этим prefix (обычно 1, максимум 2-3)
  const candidates = await db.apiKey.findMany({
    where: { keyPrefix: prefix, revokedAt: null },
    select: {
      id: true,
      keyHash: true,
      organizationId: true,
      scope: true,
      expiresAt: true,
    },
  })

  for (const candidate of candidates) {
    if (candidate.expiresAt && candidate.expiresAt < new Date()) continue
    const ok = await bcrypt.compare(token, candidate.keyHash)
    if (ok) {
      // Обновляем lastUsedAt асинхронно (не ждём — не критично)
      db.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {})
      return {
        organizationId: candidate.organizationId,
        scope: candidate.scope as ApiKeyScope,
        apiKeyId: candidate.id,
      }
    }
  }
  return null
}

export async function requireApiKey(req: Request, scope?: ApiKeyScope): Promise<ApiKeyAuth> {
  const auth = await authenticateApiKey(req)
  if (!auth) {
    throw new ApiKeyError("Требуется API-ключ. Передайте в заголовке Authorization: Bearer ck_...", 401)
  }
  if (scope === "WRITE" && auth.scope !== "WRITE") {
    throw new ApiKeyError("Этот ключ имеет права только на чтение", 403)
  }
  return auth
}

export class ApiKeyError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = "ApiKeyError"
  }
}
