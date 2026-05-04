export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { CalendarViewLoader } from "./calendar-view-loader"
import type { CalendarEvent } from "./calendar-view"
import { Calendar as CalendarIcon } from "lucide-react"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"

const CALENDAR_EVENT_SOURCE_LIMIT = 120

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  const { month } = await searchParams
  const today = new Date()
  // Текущий месяц (или из URL ?month=YYYY-MM)
  const [yearStr, monthStr] = (month ?? "").split("-")
  const year = parseInt(yearStr) || today.getFullYear()
  const monthNum = parseInt(monthStr) || (today.getMonth() + 1)

  const monthStart = new Date(year, monthNum - 1, 1)
  const monthEnd = new Date(year, monthNum, 1)
  // Чуть шире — для попадания событий на границах
  const rangeStart = new Date(monthStart.getTime() - 7 * 24 * 3600 * 1000)
  const rangeEnd = new Date(monthEnd.getTime() + 7 * 24 * 3600 * 1000)

  const buildingFilter = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const [
    upcomingCharges,
    paidPayments,
    expiringContracts,
    upcomingTasks,
  ] = await Promise.all([
    // Ожидаемые платежи (charges с dueDate в выбранном диапазоне)
    db.charge.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        tenant: buildingFilter,
      },
      select: {
        id: true, amount: true, dueDate: true, isPaid: true, type: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: CALENDAR_EVENT_SOURCE_LIMIT,
    }).catch(() => []),
    // Полученные платежи (для отображения "получено")
    db.payment.findMany({
      where: {
        paymentDate: { gte: rangeStart, lt: rangeEnd },
        tenant: buildingFilter,
      },
      select: {
        id: true, amount: true, paymentDate: true,
        tenant: { select: { id: true, companyName: true } },
      },
      take: CALENDAR_EVENT_SOURCE_LIMIT,
    }).catch(() => []),
    // Истекающие договоры
    db.tenant.findMany({
      where: {
        ...buildingFilter,
        contractEnd: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        id: true, companyName: true, contractEnd: true,
      },
      take: CALENDAR_EVENT_SOURCE_LIMIT,
    }).catch(() => []),
    // Задачи с дедлайном (dueDate)
    db.task.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        OR: [
          { buildingId: { in: visibleBuildingIds } },
          { buildingId: null, createdBy: { organizationId: orgId } },
        ],
      },
      select: {
        id: true, title: true, dueDate: true, status: true, priority: true,
      },
      take: CALENDAR_EVENT_SOURCE_LIMIT,
    }).catch(() => []),
  ])

  const events: CalendarEvent[] = []

  for (const c of upcomingCharges) {
    if (!c.dueDate) continue
    const isOverdue = !c.isPaid && c.dueDate < today
    events.push({
      id: `charge-${c.id}`,
      type: c.isPaid ? "payment_done" : (isOverdue ? "payment_overdue" : "payment_due"),
      date: c.dueDate.toISOString(),
      title: `${c.tenant.companyName}: ${c.amount.toLocaleString("ru-RU")} ₸`,
      subtitle: c.type === "PENALTY" ? "Пеня" : (c.isPaid ? "Оплачено" : "Ожидается"),
      href: `/admin/tenants/${c.tenant.id}`,
    })
  }

  for (const p of paidPayments) {
    events.push({
      id: `payment-${p.id}`,
      type: "payment_done",
      date: p.paymentDate.toISOString(),
      title: `${p.tenant.companyName}: ${p.amount.toLocaleString("ru-RU")} ₸`,
      subtitle: "Платёж получен",
      href: `/admin/tenants/${p.tenant.id}`,
    })
  }

  for (const t of expiringContracts) {
    if (!t.contractEnd) continue
    events.push({
      id: `contract-${t.id}`,
      type: "contract_ending",
      date: t.contractEnd.toISOString(),
      title: `${t.companyName}`,
      subtitle: "Договор истекает",
      href: `/admin/tenants/${t.id}`,
    })
  }

  for (const tk of upcomingTasks) {
    if (!tk.dueDate) continue
    events.push({
      id: `task-${tk.id}`,
      type: "task",
      date: tk.dueDate.toISOString(),
      title: tk.title,
      subtitle: tk.priority === "HIGH" || tk.priority === "URGENT" ? "Срочно" : "Задача",
      href: `/admin/tasks`,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Календарь
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            Платежи, договоры, задачи · {events.length} событий в этом месяце
          </p>
        </div>
      </div>

      <CalendarViewLoader
        currentYear={year}
        currentMonth={monthNum}
        events={events}
      />
    </div>
  )
}
