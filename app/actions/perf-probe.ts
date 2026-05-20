"use server"

import { headers } from "next/headers"
import { requirePlatformOwner } from "@/lib/org"

// Страницы, которые платформенный владелец может открыть без org-контекста —
// их и проверяем активно (плюс публичные / и /login).
const PROBE_ROUTES = [
  "/",
  "/login",
  "/superadmin",
  "/superadmin/orgs",
  "/superadmin/users",
  "/superadmin/subscriptions",
  "/superadmin/plans",
  "/superadmin/errors",
  "/superadmin/performance",
  "/superadmin/audit",
  "/superadmin/system-health",
]

const PER_REQUEST_TIMEOUT_MS = 15000

export type ProbeResult = {
  path: string
  status: number
  ms: number
  ok: boolean
  note?: string
}

/**
 * Активно обходит ключевые страницы (GET, с текущей сессией платформенного
 * владельца), измеряет полное время ответа и статус. Возвращает результаты для
 * показа на странице «Скорость сайта».
 */
export async function probePages(): Promise<{ checkedAt: string; results: ProbeResult[] }> {
  await requirePlatformOwner()

  const h = await headers()
  const host = h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  const cookie = h.get("cookie") ?? ""
  const base = `${proto}://${host}`

  // Ограничиваем параллелизм, чтобы не поднимать разом десяток serverless-инстансов.
  const CONCURRENCY = 4
  const results: ProbeResult[] = []
  const queue = [...PROBE_ROUTES]

  async function worker() {
    for (;;) {
      const path = queue.shift()
      if (!path) return
      results.push(await probeOne(base, path, cookie))
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

  // Сохраняем исходный порядок маршрутов.
  results.sort((a, b) => PROBE_ROUTES.indexOf(a.path) - PROBE_ROUTES.indexOf(b.path))

  return { checkedAt: new Date().toISOString(), results }
}

async function probeOne(base: string, path: string, cookie: string): Promise<ProbeResult> {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { cookie, "x-perf-probe": "1" },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    })
    // Дочитываем тело, чтобы измерить полное время рендера, а не только заголовки.
    await res.arrayBuffer().catch(() => null)
    const ms = Math.round(performance.now() - start)
    const isRedirect = res.status >= 300 && res.status < 400
    const ok = (res.status >= 200 && res.status < 300) || isRedirect
    return { path, status: res.status, ms, ok, note: isRedirect ? "редирект" : undefined }
  } catch (e) {
    const ms = Math.round(performance.now() - start)
    const timeout = e instanceof Error && e.name === "AbortError"
    return { path, status: 0, ms, ok: false, note: timeout ? "таймаут" : "ошибка соединения" }
  } finally {
    clearTimeout(timer)
  }
}
