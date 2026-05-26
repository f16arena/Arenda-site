import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/cache/invalidate
 *
 * Принудительно инвалидирует кэш админ-shell, когда cron меняет данные
 * вне serverless-контекста (где revalidate напрямую не доступен).
 *
 * Авторизация: Bearer CRON_SECRET — тот же токен что cron использует
 * (см. lib/cron-auth.ts).
 *
 * Body (опционально):
 *   { tag?: string }
 *
 * Без body инвалидирует только ADMIN_SHELL_CACHE_TAG. Если переданы другие
 * теги — инвалидируются они тоже.
 *
 * Используется в cron-ах после изменения isSuspended, planExpiresAt, founders,
 * service-fee индексации и т.п.
 */
export async function POST(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  let tag: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.tag === "string") tag = body.tag
  } catch { /* без body — инвалидируем дефолт */ }

  // Дефолт: admin-shell. Если явно передан другой тег — инвалидируем оба.
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  if (tag && tag !== ADMIN_SHELL_CACHE_TAG) {
    revalidateTag(tag, { expire: 0 })
  }

  return NextResponse.json({
    ok: true,
    invalidated: tag ? [ADMIN_SHELL_CACHE_TAG, tag] : [ADMIN_SHELL_CACHE_TAG],
    ranAt: new Date().toISOString(),
  })
}
