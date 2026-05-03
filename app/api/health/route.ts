import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import { runSystemHealthChecks, summarizeSystemChecks } from "@/lib/system-health"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const checks = await runSystemHealthChecks()
  const summary = summarizeSystemChecks(checks)
  const version = await readVersion()
  const session = await auth().catch(() => null)
  const canSeeDetails = !!session?.user?.isPlatformOwner || ["OWNER", "ADMIN"].includes(session?.user?.role ?? "")

  return NextResponse.json(
    {
      ok: summary.ok,
      status: summary.status,
      version,
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

async function readVersion() {
  return readFile(path.join(process.cwd(), "VERSION"), "utf8")
    .then((value) => value.trim())
    .catch(() => "unknown")
}
