import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { generateMonthlyInvoicesForOrg } from "@/lib/monthly-documents"

export const dynamic = "force-dynamic"

// Ежемесячная авто-генерация счетов на оплату (Вариант C). Запускается после
// monthly-invoices (начисления должны существовать). Счёт сам появляется в
// кабинете арендатора + уведомление. Гейт по фиче плана `autoInvoiceCron`.
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM

  const orgs = await db.organization.findMany({
    where: { isActive: true, isSuspended: false },
    select: { id: true, plan: { select: { features: true } } },
  })
  const allowedOrgIds = orgs
    .filter((o) => {
      try {
        const f = o.plan?.features ? JSON.parse(o.plan.features) : null
        return f?.flags?.autoInvoiceCron === true
      } catch { return false }
    })
    .map((o) => o.id)

  if (allowedOrgIds.length === 0) {
    return NextResponse.json({ ok: true, period, created: 0, note: "no orgs with autoInvoiceCron" })
  }

  let created = 0, skipped = 0, notified = 0
  const errors: string[] = []
  for (const orgId of allowedOrgIds) {
    try {
      const r = await generateMonthlyInvoicesForOrg(orgId, period)
      created += r.created; skipped += r.skipped; notified += r.notified
    } catch (e) {
      errors.push(`${orgId}: ${e instanceof Error ? e.message : "error"}`)
    }
  }

  return NextResponse.json({ ok: true, period, orgs: allowedOrgIds.length, created, skipped, notified, errors })
}
