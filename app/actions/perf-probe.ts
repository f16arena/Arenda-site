"use server"

import { headers } from "next/headers"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"

// Все статические страницы приложения (без динамических [id] и групп (...)).
const PROBE_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/verify-email",
  "/offer",
  "/privacy",
  "/terms",
  "/sla",
  // superadmin
  "/superadmin",
  "/superadmin/orgs",
  "/superadmin/orgs/new",
  "/superadmin/users",
  "/superadmin/subscriptions",
  "/superadmin/plans",
  "/superadmin/errors",
  "/superadmin/performance",
  "/superadmin/audit",
  "/superadmin/system-health",
  "/superadmin/profile",
  // admin
  "/admin",
  "/admin/analytics",
  "/admin/api-keys",
  "/admin/audit",
  "/admin/buildings",
  "/admin/calendar",
  "/admin/complaints",
  "/admin/contracts",
  "/admin/dashboard/owner",
  "/admin/data-quality",
  "/admin/documents",
  "/admin/documents/new",
  "/admin/documents/new/act",
  "/admin/documents/new/contract",
  "/admin/documents/new/invoice",
  "/admin/documents/new/reconciliation",
  "/admin/documents/templates",
  "/admin/documents/templates/act",
  "/admin/documents/templates/invoice",
  "/admin/documents/templates/reconciliation",
  "/admin/documents/templates/rental",
  "/admin/email-logs",
  "/admin/emergency",
  "/admin/faq",
  "/admin/finances",
  "/admin/finances/balance",
  "/admin/finances/import",
  "/admin/import",
  "/admin/import/tenants",
  "/admin/leads",
  "/admin/messages",
  "/admin/meters",
  "/admin/onboarding",
  "/admin/ops",
  "/admin/profile",
  "/admin/requests",
  "/admin/roles",
  "/admin/settings",
  "/admin/settings/document-templates",
  "/admin/spaces",
  "/admin/staff",
  "/admin/storage",
  "/admin/subscription",
  "/admin/system-health",
  "/admin/tasks",
  "/admin/tenants",
  "/admin/users",
  // cabinet
  "/cabinet",
  "/cabinet/documents",
  "/cabinet/faq",
  "/cabinet/finances",
  "/cabinet/messages",
  "/cabinet/meters",
  "/cabinet/profile",
  "/cabinet/requests",
]

const PER_REQUEST_TIMEOUT_MS = 12000
// Низкий параллелизм: страницы почти не конкурируют за пул соединений и CPU,
// поэтому измеренное время отражает реальную цену страницы, а не самозатор.
const CONCURRENCY = 4

export type ProbeResult = {
  path: string
  status: number
  ms: number
  ok: boolean
  note?: string
}

export type ProbeReport = {
  checkedAt: string
  totalMs: number
  okCount: number
  badCount: number
  results: ProbeResult[]
}

/**
 * Активно обходит ВСЕ статические страницы под текущей сессией платформенного
 * владельца, измеряет полное время ответа и статус. Перед записью полностью
 * удаляет прежние замеры (serverPerformanceLog) и сохраняет свежий прогон.
 */
export async function probePages(): Promise<ProbeReport> {
  await requirePlatformOwner()

  const h = await headers()
  const host = h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  const cookie = h.get("cookie") ?? ""
  const base = `${proto}://${host}`

  const startedAt = performance.now()
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
  results.sort((a, b) => PROBE_ROUTES.indexOf(a.path) - PROBE_ROUTES.indexOf(b.path))
  const totalMs = Math.round(performance.now() - startedAt)

  // Полностью удаляем прежние записи и сохраняем свежий прогон.
  try {
    await db.serverPerformanceLog.deleteMany({})
    await db.serverPerformanceLog.createMany({
      data: results.map((r) => ({
        route: r.path,
        step: "probe",
        kind: "ROUTE",
        durationMs: r.ms,
        status: r.ok ? "ok" : "error",
        error: r.note ?? null,
      })),
    })
  } catch {
    // запись не критична — отчёт всё равно вернём клиенту
  }

  return {
    checkedAt: new Date().toISOString(),
    totalMs,
    okCount: results.filter((r) => r.ok).length,
    badCount: results.filter((r) => !r.ok).length,
    results,
  }
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
