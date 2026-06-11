import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { autoCreateActsForPeriod } from "@/lib/auto-documents"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * АВР в конце месяца: акт об оказанных услугах оформляется по факту и
 * датируется последним днём месяца. Расписание Vercel — дни 28–31; внутри
 * проверяем, что СЕГОДНЯ действительно последний день месяца (по Алматы),
 * иначе выходим. Гейт по фиче плана `autoInvoiceCron` (как и счета).
 */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Сегодня по Алматы в формате YYYY-MM-DD
  const todayAlmaty = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date())
  const [y, m, d] = todayAlmaty.split("-").map(Number)
  const lastDayOfMonth = new Date(y, m, 0).getDate()
  if (d !== lastDayOfMonth) {
    return NextResponse.json({ ok: true, skipped: true, note: `не последний день месяца (${todayAlmaty})` })
  }
  const period = `${y}-${String(m).padStart(2, "0")}`

  const orgs = await db.organization.findMany({
    where: { isActive: true, isSuspended: false },
    select: { id: true, plan: { select: { features: true } } },
  })
  const allowedOrgIds = orgs
    .filter((o) => {
      try {
        const f = o.plan?.features ? JSON.parse(o.plan.features) : null
        return f?.flags?.autoInvoiceCron === true || f?.autoInvoiceCron === true
      } catch { return false }
    })
    .map((o) => o.id)

  let created = 0, skipped = 0
  const errors: string[] = []
  for (const orgId of allowedOrgIds) {
    try {
      const r = await autoCreateActsForPeriod(orgId, period)
      created += r.created
      skipped += r.skipped
    } catch (e) {
      errors.push(`${orgId}: ${e instanceof Error ? e.message : "error"}`)
    }
  }

  return NextResponse.json({ ok: true, period, orgs: allowedOrgIds.length, created, skipped, errors })
}
