import { NextResponse } from "next/server"
import { requirePlatformOwner } from "@/lib/org"
import { runSystemHealthChecks, summarizeSystemChecks } from "@/lib/system-health"
import { getReleaseInfo } from "@/lib/release"

export const dynamic = "force-dynamic"

// GET /superadmin/system-health/export
// Выгружает результат проверки системы одним JSON-файлом. Доступ только
// платформенному владельцу.
export async function GET() {
  await requirePlatformOwner()

  const [checks, release] = await Promise.all([runSystemHealthChecks(), getReleaseInfo()])
  const summary = summarizeSystemChecks(checks)

  const payload = {
    exportedAt: new Date().toISOString(),
    release: { version: release.version, commitShort: release.commitShort },
    summary,
    checks,
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="commrent-system-health-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
