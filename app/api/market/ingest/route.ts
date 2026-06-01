import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Приём агрегатов рыночной статистики от сборщика на VPS (krisha+OLX).
// Авторизация — общий секрет в заголовке X-Market-Secret (env MARKET_INGEST_SECRET).
// Каждый прогон пишет новый снимок (collected_at = now), история сохраняется.

const ALLOWED_TYPES = new Set(["OFFICE", "FREE", "RETAIL", "WAREHOUSE", "OTHER"])
const ALLOWED_SOURCES = new Set(["krisha", "olx"])

type StatInput = {
  city?: unknown
  district?: unknown
  propertyType?: unknown
  source?: unknown
  perSqmMedian?: unknown
  perSqmAvg?: unknown
  perSqmMin?: unknown
  perSqmMax?: unknown
  sampleCount?: unknown
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request) {
  const secret = process.env.MARKET_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: "MARKET_INGEST_SECRET не настроен" }, { status: 503 })
  }
  if (req.headers.get("x-market-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { source?: unknown; stats?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const defaultSource = String(body.source ?? "").trim()
  const rawStats = Array.isArray(body.stats) ? (body.stats as StatInput[]) : []
  if (rawStats.length === 0) {
    return NextResponse.json({ error: "Пустой массив stats" }, { status: 400 })
  }

  const rows: Array<{
    city: string
    district: string | null
    propertyType: string
    source: string
    perSqmMedian: number
    perSqmAvg: number | null
    perSqmMin: number | null
    perSqmMax: number | null
    sampleCount: number
  }> = []

  for (const s of rawStats) {
    const city = String(s.city ?? "").trim().toLowerCase()
    const propertyType = String(s.propertyType ?? "").trim().toUpperCase()
    const source = (String(s.source ?? "").trim() || defaultSource).toLowerCase()
    const median = num(s.perSqmMedian)
    const sampleCount = num(s.sampleCount)

    if (!city || !ALLOWED_TYPES.has(propertyType) || !ALLOWED_SOURCES.has(source)) continue
    if (median === null || median <= 0) continue
    if (sampleCount === null || sampleCount < 1) continue

    const districtRaw = String(s.district ?? "").trim()
    rows.push({
      city,
      district: districtRaw || null,
      propertyType,
      source,
      perSqmMedian: Math.round(median),
      perSqmAvg: num(s.perSqmAvg) !== null ? Math.round(num(s.perSqmAvg)!) : null,
      perSqmMin: num(s.perSqmMin) !== null ? Math.round(num(s.perSqmMin)!) : null,
      perSqmMax: num(s.perSqmMax) !== null ? Math.round(num(s.perSqmMax)!) : null,
      sampleCount: Math.round(sampleCount),
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Нет валидных записей после проверки" }, { status: 400 })
  }

  await db.marketRentStat.createMany({ data: rows })
  return NextResponse.json({ ok: true, inserted: rows.length })
}
