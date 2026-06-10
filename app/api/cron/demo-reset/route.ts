import { NextResponse } from "next/server"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { resetDemoOrg } from "@/lib/demo"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Ежедневный сброс публичной демо-организации: все данные сносятся и
// наполняются заново (см. lib/demo.ts). Расписание — vercel.json.
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const { orgId } = await resetDemoOrg()
    return NextResponse.json({ ok: true, orgId, ranAt: new Date().toISOString() })
  } catch (e) {
    console.error("[demo-reset]", e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
