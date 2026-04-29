import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/health/db
// Подробная диагностика подключения к БД, без авторизации.
// Открывайте на Vercel https://your-app.vercel.app/api/health/db чтобы увидеть статус.
export async function GET() {
  const checks: { name: string; ok: boolean; ms: number; result?: unknown; error?: string }[] = []

  // 1. Простейший SELECT 1
  let t0 = Date.now()
  try {
    const r = await db.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 as ok")
    checks.push({ name: "select_1", ok: true, ms: Date.now() - t0, result: r })
  } catch (e) {
    checks.push({
      name: "select_1",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    })
  }

  // 2. Версия Postgres
  t0 = Date.now()
  try {
    const r = await db.$queryRawUnsafe<{ version: string }[]>("SELECT version()")
    checks.push({ name: "version", ok: true, ms: Date.now() - t0, result: r[0]?.version })
  } catch (e) {
    checks.push({
      name: "version",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 3. Счёт организаций
  t0 = Date.now()
  try {
    const count = await db.organization.count()
    checks.push({ name: "organization_count", ok: true, ms: Date.now() - t0, result: count })
  } catch (e) {
    checks.push({
      name: "organization_count",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 4. Счёт пользователей
  t0 = Date.now()
  try {
    const count = await db.user.count()
    checks.push({ name: "user_count", ok: true, ms: Date.now() - t0, result: count })
  } catch (e) {
    checks.push({
      name: "user_count",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const env = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL ?? null,
    VERCEL_REGION: process.env.VERCEL_REGION ?? null,
    DATABASE_URL_HOST: parseHost(process.env.DATABASE_URL),
    ROOT_HOST: process.env.ROOT_HOST ?? "(default: commrent.kz)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
  }

  const ok = checks.every((c) => c.ok)

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    env,
    checks,
  }, { status: ok ? 200 : 503 })
}

// Извлекает host:port из URL без раскрытия пароля
function parseHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || "5432"}`
  } catch {
    return "invalid"
  }
}
