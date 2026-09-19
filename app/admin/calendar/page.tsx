export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import type { Prisma } from "@/app/generated/prisma/client"
import { Calendar as CalendarIcon } from "lucide-react"
import { redirect } from "next/navigation"
import { CalendarView, type CalendarEvent } from "./calendar-view"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { db } from "@/lib/db"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { PageHeader } from "@/components/ui/page"

const CALENDAR_EVENT_SOURCE_LIMIT = 80

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  return measureServerRoute("/admin/calendar", () => renderCalendarPage({ searchParams }))
}

async function renderCalendarPage({
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

  // Все четыре пути привязки арендатора к зданию: основное помещение, несколько
  // помещений, этаж целиком и здание напрямую (место без помещения — киоск,
  // автомат). Раньше учитывались только два — большинство арендаторов в
  // календарь не попадало.
  const tenantBuildingFilter: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      { buildingId: { in: visibleBuildingIds } },
    ],
  }

  // Оплаченное начисление показывает сама оплата — иначе один платёж
  // появлялся в календаре дважды.
  const chargeWhere: Prisma.ChargeWhereInput = {
    dueDate: { gte: rangeStart, lt: rangeEnd },
    isPaid: false,
    deletedAt: null,
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
  ] = await measureServerStep("/admin/calendar", "calendar-data", Promise.all([
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
  ]))
  // Раньше дополнительно делали 4 count-запроса — это удваивало нагрузку
  // при каждом переключении месяца. Теперь «упёрлись в лимит» определяем
  // по тому, что любая из выборок вернула ровно CALENDAR_EVENT_SOURCE_LIMIT
  // строк (это значит, что данных могло быть больше — мы их обрезали).

  // День события — по времени Казахстана. toISOString() даёт UTC, и платёж
  // от 9-го в полночь по Алматы попадал в календарь на 8-е.
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(d)
  const todayKey = dayKey(today)
  const TYPE_LABEL: Record<string, string> = { RENT: "Аренда", SERVICE_FEE: "Эксплуатационные", ELECTRICITY: "Электроэнергия", WATER: "Вода", HEATING: "Отопление", PENALTY: "Пеня", DEPOSIT: "Депозит", CLEANING: "Уборка" }

  const events: CalendarEvent[] = []

  for (const charge of upcomingCharges) {
    if (!charge.dueDate) continue
    const day = dayKey(charge.dueDate)
    const isOverdue = day < todayKey
    events.push({
      id: `charge-${charge.id}`,
      type: isOverdue ? "payment_overdue" : "payment_due",
      day,
      amount: charge.amount,
      title: charge.tenant.companyName,
      subtitle: `${TYPE_LABEL[charge.type] ?? "Начисление"} · ${charge.amount.toLocaleString("ru-RU")} ₸${isOverdue ? " · просрочено" : ""}`,
      href: `/admin/tenants/${charge.tenant.id}`,
    })
  }

  for (const payment of paidPayments) {
    events.push({
      id: `payment-${payment.id}`,
      type: "payment_done",
      day: dayKey(payment.paymentDate),
      amount: payment.amount,
      title: payment.tenant.companyName,
      subtitle: `Оплата получена · ${payment.amount.toLocaleString("ru-RU")} ₸`,
      href: `/admin/tenants/${payment.tenant.id}`,
    })
  }

  for (const tenant of expiringContracts) {
    if (!tenant.contractEnd) continue
    events.push({
      id: `contract-${tenant.id}`,
      type: "contract_ending",
      day: dayKey(tenant.contractEnd),
      title: tenant.companyName,
      subtitle: "Заканчивается договор — продлите или найдите нового арендатора",
      href: `/admin/tenants/${tenant.id}`,
    })
  }

  for (const task of upcomingTasks) {
    if (!task.dueDate) continue
    events.push({
      id: `task-${task.id}`,
      type: "task",
      day: dayKey(task.dueDate),
      title: task.title,
      subtitle: task.priority === "HIGH" || task.priority === "URGENT" ? "Срочная задача" : "Задача",
      href: "/admin/tasks",
    })
  }

  // Итоги именно этого месяца (события соседних недель нужны сетке, но не счёту)
  const monthPrefix = `${year}-${String(monthNum).padStart(2, "0")}`
  const monthEvents = events.filter((e) => e.day.startsWith(monthPrefix))
  const sumOf = (type: CalendarEvent["type"]) => monthEvents.filter((e) => e.type === type).reduce((sum, e) => sum + (e.amount ?? 0), 0)
  const summary = {
    expected: sumOf("payment_due"),
    overdue: sumOf("payment_overdue"),
    received: sumOf("payment_done"),
    contracts: monthEvents.filter((e) => e.type === "contract_ending").length,
  }

  const isCalendarCapped =
    upcomingCharges.length === CALENDAR_EVENT_SOURCE_LIMIT ||
    paidPayments.length === CALENDAR_EVENT_SOURCE_LIMIT ||
    expiringContracts.length === CALENDAR_EVENT_SOURCE_LIMIT ||
    upcomingTasks.length === CALENDAR_EVENT_SOURCE_LIMIT

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarIcon}
        title="Календарь"
        subtitle={`Когда ждать деньги, когда кончаются договоры и что по задачам${isCalendarCapped ? " · показаны первые события" : ""}`}
      />

      {isCalendarCapped && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          В месяце больше событий, чем безопасный лимит загрузки. Чтобы страница открывалась быстро,
          календарь показывает первые события по датам; уточните месяц или выберите конкретное здание.
        </div>
      )}

      <CalendarView
        currentYear={year}
        currentMonth={monthNum}
        events={events}
        todayKey={todayKey}
        summary={summary}
      />
    </div>
  )
}
