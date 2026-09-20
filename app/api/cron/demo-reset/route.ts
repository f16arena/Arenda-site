import { NextResponse } from "next/server"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { resetDemoOrg } from "@/lib/demo"
import { pruneTelemetry } from "@/lib/telemetry-retention"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Ежедневный сброс публичной демо-организации и чистка телеметрии: все данные сносятся и
// наполняются заново (см. lib/demo.ts). Расписание — vercel.json.
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const { orgId } = await resetDemoOrg()
    // Заодно чистим телеметрию: она копилась с мая и уже была самой большой
    // таблицей базы (web_vital_metrics — 14 600 строк).
    const pruned = await pruneTelemetry()
    return NextResponse.json({ ok: true, orgId, pruned, ranAt: new Date().toISOString() })
  } catch (e) {
    console.error("[demo-reset]", e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
