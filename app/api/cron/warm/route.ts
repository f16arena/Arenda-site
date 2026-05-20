import { NextResponse } from "next/server"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { ROOT_HOST } from "@/lib/host"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Прогрев: дёргаем ключевые страницы, чтобы их serverless-функции не «засыпали»
// и реальные пользователи не попадали на холодный старт (TTFB до 13с на /).
// Auth-страницы вернут 307 (без сессии), но сам холодный буст функции при этом
// уже прогревается. Публичные страницы (/) прогреваются полностью.
const WARM_PATHS = [
  "/",
  "/login",
  "/signup",
  "/superadmin",
  "/admin",
  "/cabinet",
  "/admin/finances",
  "/admin/tenants",
]

export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const base = `https://${ROOT_HOST}`
  const results = await Promise.all(
    WARM_PATHS.map(async (path) => {
      const start = Date.now()
      try {
        const res = await fetch(`${base}${path}`, {
          headers: { "x-warmup": "1" },
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        })
        await res.arrayBuffer().catch(() => null)
        return { path, status: res.status, ms: Date.now() - start }
      } catch (e) {
        return { path, status: 0, ms: Date.now() - start, error: e instanceof Error ? e.message : "error" }
      }
    }),
  )

  return NextResponse.json({ warmedAt: new Date().toISOString(), results })
}
