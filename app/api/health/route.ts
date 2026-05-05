import { NextResponse } from "next/server"
import { runSystemHealthChecks, summarizeSystemChecks } from "@/lib/system-health"
import { auth } from "@/auth"
import { getReleaseInfo } from "@/lib/release"

export const dynamic = "force-dynamic"

export async function GET() {
  const checks = await runSystemHealthChecks()
  const summary = summarizeSystemChecks(checks)
  const release = await getReleaseInfo()
  const session = await auth().catch(() => null)
  const canSeeDetails = !!session?.user?.isPlatformOwner || ["OWNER", "ADMIN"].includes(session?.user?.role ?? "")

  return NextResponse.json(
    {
      ok: summary.ok,
      status: summary.status,
      version: release.version,
      release,
      checkedAt: new Date().toISOString(),
      summary,
      checks: canSeeDetails
        ? checks
        : checks.map((check) => ({
            id: check.id,
            label: check.label,
            status: check.status,
            ms: check.ms,
          })),
    },
    { status: summary.status === "error" ? 503 : 200 }
  )
}
