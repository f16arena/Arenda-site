export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import type { Prisma } from "@/app/generated/prisma/client"
import { Calendar as CalendarIcon } from "lucide-react"
import { redirect } from "next/navigation"
import { CalendarViewLoader } from "./calendar-view-loader"
import type { CalendarEvent } from "./calendar-view"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { db } from "@/lib/db"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"

const CALENDAR_EVENT_SOURCE_LIMIT = 80

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/calendar", orgId, userId: session.user.id })

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  const { month } = await searchParams
  const today = new Date()
  const [yearStr, monthStr] = (month ?? "").split("-")
  const year = parseInt(yearStr, 10) || today.getFullYear()
  const monthNum = parseInt(monthStr, 10) || today.getMonth() + 1

  const monthStart = new Date(year, monthNum - 1, 1)
  const monthEnd = new Date(year, monthNum, 1)
  const rangeStart = new Date(monthStart.getTime() - 7 * 24 * 3600 * 1000)
  const rangeEnd = new Date(monthEnd.getTime() + 7 * 24 * 3600 * 1000)

  const tenantBuildingFilter: Prisma.TenantWhereInput = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const chargeWhere: Prisma.ChargeWhereInput = {
    dueDate: { gte: rangeStart, lt: rangeEnd },
    tenant: tenantBuildingFilter,
  }
  const paymentWhere: Prisma.PaymentWhereInput = {
    paymentDate: { gte: rangeStart, lt: rangeEnd },
    tenant: tenantBuildingFilter,
  }
  const contractWhere: Prisma.TenantWhereInput = {
    ...tenantBuildingFilter,
    contractEnd: { gte: rangeStart, lt: rangeEnd },
  }
  const taskWhere: Prisma.TaskWhereInput = {
    dueDate: { gte: rangeStart, lt: rangeEnd },
    OR: [
      { buildingId: { in: visibleBuildingIds } },
      { buildingId: null, createdBy: { organizationId: orgId } },
    ],
  }

  const [
    upcomingCharges,
    paidPayments,
    expiringContracts,
    upcomingTasks,
    totalCharges,
    totalPayments,
    totalExpiringContracts,
    totalTasks,
  ] = await Promise.all([
    safe(
      "admin.calendar.charges",
      db.charge.findMany({
        where: chargeWhere,
        select: {
          id: true,
          amount: true,
          dueDate: true,
          isPaid: true,
          type: true,
          tenant: { select: { id: true, companyName: true } },
        },
        orderBy: { dueDate: "asc" },
        take: CALENDAR_EVENT_SOURCE_LIMIT,
      }),
      [],
    ),
    safe(
      "admin.calendar.payments",
      db.payment.findMany({
        where: paymentWhere,
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          tenant: { select: { id: true, companyName: true } },
        },
        orderBy: { paymentDate: "asc" },
        take: CALENDAR_EVENT_SOURCE_LIMIT,
      }),
      [],
    ),
    safe(
      "admin.calendar.expiringContracts",
      db.tenant.findMany({
        where: contractWhere,
        select: {
          id: true,
          companyName: true,
          contractEnd: true,
        },
        orderBy: { contractEnd: "asc" },
        take: CALENDAR_EVENT_SOURCE_LIMIT,
      }),
      [],
    ),
    safe(
      "admin.calendar.tasks",
      db.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
          priority: true,
        },
        orderBy: { dueDate: "asc" },
        take: CALENDAR_EVENT_SOURCE_LIMIT,
      }),
      [],
    ),
    safe("admin.calendar.charges.count", db.charge.count({ where: chargeWhere }), 0),
    safe("admin.calendar.payments.count", db.payment.count({ where: paymentWhere }), 0),
    safe("admin.calendar.expiringContracts.count", db.tenant.count({ where: contractWhere }), 0),
    safe("admin.calendar.tasks.count", db.task.count({ where: taskWhere }), 0),
  ])

  const events: CalendarEvent[] = []

  for (const charge of upcomingCharges) {
    if (!charge.dueDate) continue
    const isOverdue = !charge.isPaid && charge.dueDate < today
    events.push({
      id: `charge-${charge.id}`,
      type: charge.isPaid ? "payment_done" : isOverdue ? "payment_overdue" : "payment_due",
      date: charge.dueDate.toISOString(),
      title: `${charge.tenant.companyName}: ${charge.amount.toLocaleString("ru-RU")} ₸`,
      subtitle: charge.type === "PENALTY" ? "Пеня" : charge.isPaid ? "Оплачено" : "Ожидается",
      href: `/admin/tenants/${charge.tenant.id}`,
    })
  }

  for (const payment of paidPayments) {
    events.push({
      id: `payment-${payment.id}`,
      type: "payment_done",
      date: payment.paymentDate.toISOString(),
      title: `${payment.tenant.companyName}: ${payment.amount.toLocaleString("ru-RU")} ₸`,
      subtitle: "Платеж получен",
      href: `/admin/tenants/${payment.tenant.id}`,
    })
  }

  for (const tenant of expiringContracts) {
    if (!tenant.contractEnd) continue
    events.push({
      id: `contract-${tenant.id}`,
      type: "contract_ending",
      date: tenant.contractEnd.toISOString(),
      title: tenant.companyName,
      subtitle: "Договор истекает",
      href: `/admin/tenants/${tenant.id}`,
    })
  }

  for (const task of upcomingTasks) {
    if (!task.dueDate) continue
    events.push({
      id: `task-${task.id}`,
      type: "task",
      date: task.dueDate.toISOString(),
      title: task.title,
      subtitle: task.priority === "HIGH" || task.priority === "URGENT" ? "Срочно" : "Задача",
      href: "/admin/tasks",
    })
  }

  const totalAvailableEvents = totalCharges + totalPayments + totalExpiringContracts + totalTasks
  const isCalendarCapped = totalAvailableEvents > events.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <CalendarIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            Календарь
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Платежи, договоры, задачи · показано {events.length} из {totalAvailableEvents} событий в этом месяце
          </p>
        </div>
      </div>

      {isCalendarCapped && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          В месяце больше событий, чем безопасный лимит загрузки. Чтобы страница открывалась быстро,
          календарь показывает первые события по датам; уточните месяц или выберите конкретное здание.
        </div>
      )}

      <CalendarViewLoader
        currentYear={year}
        currentMonth={monthNum}
        events={events}
      />
    </div>
  )
}
