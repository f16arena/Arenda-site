export const dynamic = "force-dynamic"

import { Suspense } from "react"
import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { getCurrentBuildingId } from "@/lib/current-building"
import {
  Building2, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight, ArrowRight,
  Mail, Wallet,
  ClipboardCheck, ShieldCheck,
  FileSignature, ShieldAlert, CalendarClock, PiggyBank,
  CircleCheck, Circle, Download, Activity,
} from "lucide-react"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getOnboardingState } from "@/lib/onboarding"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { safeServerValue } from "@/lib/server-fallback"
import type { Prisma } from "@/app/generated/prisma/client"
import { DashboardLazySections } from "./dashboard-lazy-sections"

// Единый пункт центра действий «Сейчас важно». Заменил три дублировавших друг
// друга блока старого дашборда (Главное действие / Требует внимания / Рабочий
// день): одна ранжированная лента, каждый факт показан ровно один раз.
type ActionItem = {
  href: string
  title: string
  sub: string
  value: string
  icon: React.ElementType
  tone: "red" | "amber" | "blue" | "emerald" | "violet"
  active: boolean
  /** Чем меньше — тем выше в списке (при равной активности) */
  rank: number
}

// floorIds + tenant-scope where: нужны и базовым, и операционным метрикам.
async function loadFloorScope(orgId: string, visibleBuildingIds: string[]) {
  const floorIds = await safeServerValue(
    db.floor.findMany({ where: { buildingId: { in: visibleBuildingIds } }, select: { id: true } }).then((floors) => floors.map((f) => f.id)),
    [] as string[],
    { source: "admin.dashboard.floorIds", route: "/admin", orgId },
  )
  const tenantWhereInBuilding: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }
  return { floorIds, tenantWhereInBuilding }
}

// Скелет первого экрана — отдаётся мгновенно, пока стримятся базовые метрики.
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-44 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <OperationalSkeleton />
    </div>
  )
}

// Скелет центра действий (стримится отдельно).
function OperationalSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-2 xl:col-span-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-56 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}

// Оболочка отдаётся сразу; тяжёлый дашборд стримится через Suspense, поэтому
// первый экран не ждёт десятки запросов.
export default function AdminDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardBody />
    </Suspense>
  )
}

async function DashboardBody() {
  return measureServerRoute("/admin", async () => {
  const { orgId, userId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin", orgId })
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  if (visibleBuildingIds.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 dark:text-slate-300 font-semibold mb-1">Нет доступных зданий</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Создайте здание или назначьте пользователя на нужные здания</p>
        <Link href="/admin/buildings" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          К списку зданий
        </Link>
      </div>
    )
  }

  const { floorIds, tenantWhereInBuilding } = await loadFloorScope(orgId, visibleBuildingIds)

  const [
    tenantsCount,
    activeTenants,
    spacesGroup,
    chargesAgg,
    onboarding,
    currentUser2fa,
  ] = await measureServerStep("/admin", "base-metrics", Promise.all([
    safe("admin.dashboard.tenantsCount", db.tenant.count({ where: tenantWhereInBuilding }), 0),
    safe(
      "admin.dashboard.activeTenants",
      db.tenant.findMany({
        where: tenantWhereInBuilding,
        select: {
          id: true,
          customRate: true,
          fixedMonthlyRent: true,
          space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
          tenantSpaces: {
            select: {
              space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
            },
          },
          fullFloors: { select: { fixedMonthlyRent: true } },
        },
      }),
      [] as Array<{
        id: string
        customRate: number | null
        fixedMonthlyRent: number | null
        space: { area: number; floor: { ratePerSqm: number } } | null
        tenantSpaces: { space: { area: number; floor: { ratePerSqm: number } } }[]
        fullFloors: { fixedMonthlyRent: number | null }[]
      }>,
    ),
    safe(
      "admin.dashboard.spacesGroup",
      db.space.groupBy({
        by: ["status"],
        where: { floorId: { in: floorIds } },
        _count: { _all: true },
      }),
      [] as Array<{ status: string; _count: { _all: number } }>,
    ),
    safe(
      "admin.dashboard.chargesAggregate",
      db.charge.aggregate({
        where: {
          isPaid: false,
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe("admin.dashboard.onboarding", getOnboardingState(orgId), {
      allDone: true,
      nextStep: null,
      nextRequiredStep: null,
      steps: [],
      doneCount: 0,
      totalCount: 0,
      requiredCount: 0,
      doneRequiredCount: 0,
      recommendedCount: 0,
      doneRecommendedCount: 0,
      percent: 100,
    }),
    safe(
      "admin.dashboard.currentUser2fa",
      db.user.findUnique({
        where: { id: userId },
        select: { role: true, totpEnabledAt: true },
      }),
      null as { role: string; totpEnabledAt: Date | null } | null,
    ),
  ]))

  const occupiedSpaces = spacesGroup.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const vacantSpaces = spacesGroup.find((s) => s.status === "VACANT")?._count._all ?? 0
  const rentableTotal = occupiedSpaces + vacantSpaces
  const occupancyPct = rentableTotal > 0 ? Math.round((occupiedSpaces / rentableTotal) * 100) : 0
  const totalDebt = chargesAgg._sum.amount ?? 0
  const debtCount = chargesAgg._count._all
  const monthlyRevenue = activeTenants.reduce((sum, t) => {
    return sum + calculateTenantMonthlyRent(t)
  }, 0)

  // Приветствие по времени Алматы (сервер в UTC)
  const now = new Date()
  const almatyHour = Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hour12: false, timeZone: "Asia/Almaty" }).format(now))
  const greeting = almatyHour < 5 ? "Доброй ночи" : almatyHour < 12 ? "Доброе утро" : almatyHour < 18 ? "Добрый день" : "Добрый вечер"
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Almaty" }).format(now)

  return (
    <div className="space-y-5">
      {/* ── Hero: контекст + ключевые цифры одной тёмной панелью ── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 right-32 h-64 w-64 rounded-full bg-indigo-500/10 blur-2xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm text-slate-400 capitalize">{todayLabel}</p>
              <h1 className="mt-0.5 text-2xl font-semibold">{greeting}!</h1>
            </div>
            <p className="text-xs text-slate-400">
              {buildingId ? "Выбранное здание" : `Все здания · ${visibleBuildingIds.length}`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <HeroMetric
              label="Доход в месяц"
              value={formatMoney(monthlyRevenue)}
              sub="расчётный по договорам"
            />
            <HeroMetric
              label="Долг арендаторов"
              value={formatMoney(totalDebt)}
              sub={debtCount > 0 ? `${debtCount} неоплаченных` : "долгов нет"}
              tone={totalDebt > 0 ? "red" : "emerald"}
            />
            <div>
              <p className="text-xs text-slate-400">Заполняемость</p>
              <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{occupancyPct}%</p>
              <div className="mt-1.5 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400" style={{ width: `${occupancyPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{occupiedSpaces} занято · {vacantSpaces} свободно</p>
            </div>
            <HeroMetric
              label="Арендаторы"
              value={String(activeTenants.length)}
              sub={`из ${tenantsCount} зарегистрированных`}
            />
          </div>
        </div>
      </section>

      {/* Компактные предупреждения (2FA / запуск платформы) */}
      {currentUser2fa && currentUser2fa.role === "OWNER" && !currentUser2fa.totpEnabledAt && (
        <SlimBanner
          href="/admin/profile?tab=notifications"
          icon={ShieldAlert}
          tone="amber"
          title="Включите двухфакторную аутентификацию"
          sub="Защитит аккаунт владельца даже при утечке пароля"
          cta="Настроить"
        />
      )}
      {!onboarding.allDone && onboarding.nextStep && (
        <SlimBanner
          href="/admin/onboarding"
          icon={ClipboardCheck}
          tone="blue"
          title={`Запуск платформы: ${onboarding.percent}%`}
          sub={`Следующий шаг: ${onboarding.nextStep.title.toLowerCase()}`}
          cta="Чеклист"
          progress={onboarding.percent}
        />
      )}

      {/* Центр действий + пульс дня стримятся отдельно от hero */}
      <Suspense fallback={<OperationalSkeleton />}>
        <DashboardOperational orgId={orgId} visibleBuildingIds={visibleBuildingIds} />
      </Suspense>

      <DashboardLazySections forecastMonthlyRevenue={monthlyRevenue} showPortfolio={!buildingId} />
    </div>
  )
  })
}

async function DashboardOperational({
  orgId,
  visibleBuildingIds,
}: {
  orgId: string
  visibleBuildingIds: string[]
}) {
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin", orgId })
  const { floorIds, tenantWhereInBuilding } = await loadFloorScope(orgId, visibleBuildingIds)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(todayStart.getTime() + 24 * 3600 * 1000)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000)
  const in30Days = new Date(todayStart.getTime() + 30 * 24 * 3600 * 1000)

  const [
    overdueCharges,
    pendingPaymentReports,
    dataQualityIssues,
    expiringContracts,
    todayRequests,
    yesterdayPayments,
    openRequestsCount,
    openTasksCount,
    documentsOnSignature,
    unpaidDeposits,
  ] = await measureServerStep("/admin", "today-metrics", Promise.all([
    safe(
      "admin.dashboard.overdueCharges",
      db.charge.aggregate({
        where: {
          isPaid: false,
          dueDate: { lt: todayStart },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.dashboard.pendingPaymentReports",
      db.paymentReport.aggregate({
        where: {
          status: { in: ["PENDING", "DISPUTED"] },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe("admin.dashboard.dataQualityIssues", (async () => {
      const [
        doubleRentCount,
        missingContactCount,
        noSignedContractCount,
        chargeMissingDueDateCount,
        occupiedWithoutTenantCount,
        vacantWithTenantCount,
      ] = await Promise.all([
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { customRate: { gt: 0 }, fixedMonthlyRent: { gt: 0 } },
            ],
          },
        }),
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { OR: [{ user: { email: null } }, { user: { email: "" } }] },
              { OR: [{ user: { phone: null } }, { user: { phone: "" } }] },
            ],
          },
        }),
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }] },
              { contracts: { none: { status: "SIGNED" } } },
            ],
          },
        }),
        db.charge.count({
          where: {
            isPaid: false,
            dueDate: null,
            tenant: tenantWhereInBuilding,
          },
        }),
        db.space.count({
          where: {
            kind: "RENTABLE",
            status: "OCCUPIED",
            tenant: { is: null },
            tenantSpaces: { none: {} },
            floor: { buildingId: { in: visibleBuildingIds }, fullFloorTenantId: null },
          },
        }),
        db.space.count({
          where: {
            kind: "RENTABLE",
            status: "VACANT",
            OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
            floorId: { in: floorIds },
          },
        }),
      ])

      return doubleRentCount
        + missingContactCount
        + noSignedContractCount
        + chargeMissingDueDateCount
        + occupiedWithoutTenantCount
        + vacantWithTenantCount
    })(), 0),
    safe(
      "admin.dashboard.expiringContracts",
      db.tenant.count({
        where: {
          ...tenantWhereInBuilding,
          contractEnd: { gte: todayStart, lte: in30Days },
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.todayRequests",
      db.request.count({
        where: {
          createdAt: { gte: todayStart, lt: tomorrow },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.yesterdayPayments",
      db.payment.aggregate({
        where: {
          paymentDate: { gte: yesterdayStart, lt: todayStart },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.dashboard.openRequestsCount",
      db.request.count({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.openTasksCount",
      db.task.count({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          OR: [
            { buildingId: { in: visibleBuildingIds } },
            { buildingId: null, createdBy: { organizationId: orgId } },
          ],
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.documentsOnSignature",
      db.contract.count({
        where: {
          status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.unpaidDeposits",
      db.charge.aggregate({
        where: {
          type: "DEPOSIT",
          isPaid: false,
          deletedAt: null,
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
  ]))

  // ── Цикл месяца: начисления → счета → АВР → оплаты ──
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [cycleCharges, cyclePaidCharges, cycleInvoices, cycleActs, cycleActiveTenants] = await Promise.all([
    safe("admin.dashboard.cycleCharges", db.charge.count({ where: { period: currentPeriod, deletedAt: null, type: { not: "DEPOSIT_REFUND" }, tenant: tenantWhereInBuilding } }), 0),
    safe("admin.dashboard.cyclePaid", db.charge.count({ where: { period: currentPeriod, deletedAt: null, isPaid: true, type: { not: "DEPOSIT_REFUND" }, tenant: tenantWhereInBuilding } }), 0),
    safe("admin.dashboard.cycleInvoices", db.generatedDocument.count({ where: { organizationId: orgId, documentType: "INVOICE", period: currentPeriod, deletedAt: null } }), 0),
    safe("admin.dashboard.cycleActs", db.generatedDocument.count({ where: { organizationId: orgId, documentType: "ACT", period: currentPeriod, deletedAt: null } }), 0),
    safe("admin.dashboard.cycleTenants", db.tenant.count({
      where: {
        AND: [
          tenantWhereInBuilding,
          { OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }] },
          { contracts: { some: { status: "SIGNED", deletedAt: null } } },
        ],
      },
    }), 0),
  ])
  const cycleSteps = [
    {
      label: "Начисления",
      done: cycleCharges > 0,
      value: cycleCharges > 0 ? `${cycleCharges} шт` : "не созданы",
      href: "/admin/finances",
    },
    {
      label: "Счета",
      done: cycleActiveTenants > 0 && cycleInvoices >= cycleActiveTenants,
      value: `${cycleInvoices} из ${cycleActiveTenants}`,
      href: "/admin/documents/new/invoice",
    },
    {
      label: "АВР",
      done: cycleActiveTenants > 0 && cycleActs >= cycleActiveTenants,
      value: `${cycleActs} из ${cycleActiveTenants}`,
      href: "/admin/documents/new/act",
    },
    {
      label: "Оплаты",
      done: cycleCharges > 0 && cyclePaidCharges >= cycleCharges,
      value: cycleCharges > 0 ? `${cyclePaidCharges} из ${cycleCharges}` : "—",
      href: "/admin/finances?chargeStatus=unpaid",
    },
  ]
  const cycleDone = cycleSteps.filter((s) => s.done).length

  // ── Центр действий: каждый факт ровно один раз, отсортирован по срочности ──
  const actionsRaw: ActionItem[] = [
    {
      href: "/admin/finances?filter=overdue",
      title: "Собрать просроченные платежи",
      sub: (overdueCharges._sum.amount ?? 0) > 0 ? formatMoney(overdueCharges._sum.amount ?? 0) : "просрочек нет",
      value: `${overdueCharges._count._all ?? 0}`,
      icon: AlertTriangle,
      tone: "red",
      active: (overdueCharges._count._all ?? 0) > 0,
      rank: 1,
    },
    {
      href: "/admin/finances",
      title: "Проверить заявленные оплаты",
      sub: (pendingPaymentReports._sum.amount ?? 0) > 0 ? `чеки на ${formatMoney(pendingPaymentReports._sum.amount ?? 0)}` : "новых чеков нет",
      value: `${pendingPaymentReports._count._all ?? 0}`,
      icon: Wallet,
      tone: "emerald",
      active: (pendingPaymentReports._count._all ?? 0) > 0,
      rank: 2,
    },
    {
      href: "/admin/documents",
      title: "Довести подписи документов",
      sub: "договоры и ДС ждут сторону",
      value: `${documentsOnSignature}`,
      icon: FileSignature,
      tone: "violet",
      active: documentsOnSignature > 0,
      rank: 3,
    },
    {
      href: "/admin/finances/deposits",
      title: "Получить депозиты",
      sub: (unpaidDeposits._sum.amount ?? 0) > 0 ? formatMoney(unpaidDeposits._sum.amount ?? 0) : "все депозиты внесены",
      value: `${unpaidDeposits._count._all ?? 0}`,
      icon: PiggyBank,
      tone: "amber",
      active: (unpaidDeposits._count._all ?? 0) > 0,
      rank: 4,
    },
    {
      href: "/admin/tenants?filter=expiring",
      title: "Продлить истекающие договоры",
      sub: "заканчиваются в ближайшие 30 дней",
      value: `${expiringContracts}`,
      icon: CalendarClock,
      tone: "blue",
      active: expiringContracts > 0,
      rank: 5,
    },
    {
      href: "/admin/requests",
      title: "Ответить на заявки",
      sub: "арендаторы ждут реакции",
      value: `${openRequestsCount}`,
      icon: ClipboardList,
      tone: "blue",
      active: openRequestsCount > 0,
      rank: 6,
    },
    {
      href: "/admin/tasks",
      title: "Закрыть задачи",
      sub: "операционные задачи в работе",
      value: `${openTasksCount}`,
      icon: CheckSquare,
      tone: "blue",
      active: openTasksCount > 0,
      rank: 7,
    },
    {
      href: "/admin/data-quality",
      title: "Исправить ошибки в данных",
      sub: "аренда, контакты, договоры",
      value: `${dataQualityIssues}`,
      icon: ShieldCheck,
      tone: "amber",
      active: dataQualityIssues > 0,
      rank: 8,
    },
  ]
  const actions = [...actionsRaw].sort((a, b) => Number(b.active) - Number(a.active) || a.rank - b.rank)
  const activeActions = actions.filter((a) => a.active)

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      {/* ── Левая колонка: центр действий ── */}
      <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Сейчас важно</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            activeActions.length > 0
              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          }`}>
            {activeActions.length > 0 ? `${activeActions.length} действий` : "всё спокойно"}
          </span>
        </div>
        {activeActions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <CircleCheck className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Критичных действий нет</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Долги, оплаты, документы и данные в порядке по текущему срезу.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {activeActions.map((a) => <ActionRow key={a.href + a.title} item={a} />)}
          </ul>
        )}
        {/* Неактивные — тонкой строкой, чтобы было видно, что ещё под контролем */}
        {activeActions.length > 0 && activeActions.length < actions.length && (
          <p className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Под контролем: {actions.filter((a) => !a.active).map((a) => a.title.toLowerCase().replace(/^[а-яё]+ /, "")).join(" · ")}
          </p>
        )}
      </section>

      {/* ── Правая колонка: пульс дня + цикл месяца ── */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Activity className="h-4 w-4 text-slate-400" />
            Пульс
          </h2>
          <div className="mt-3 space-y-2.5">
            <PulseRow
              href="/admin/requests"
              icon={Mail}
              label="Новые заявки сегодня"
              value={todayRequests > 0 ? `${todayRequests}` : "—"}
              highlight={todayRequests > 0}
            />
            <PulseRow
              href="/admin/finances"
              icon={Wallet}
              label={`Поступления вчера${(yesterdayPayments._count._all ?? 0) > 0 ? ` · ${yesterdayPayments._count._all} пл.` : ""}`}
              value={(yesterdayPayments._sum.amount ?? 0) > 0 ? formatMoney(yesterdayPayments._sum.amount ?? 0) : "—"}
              highlight={(yesterdayPayments._sum.amount ?? 0) > 0}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Цикл месяца</h2>
              <span className="text-xs tabular-nums text-slate-400">{cycleDone}/4</span>
            </div>
            <div className="mt-2 flex gap-1">
              {cycleSteps.map((s) => (
                <div key={s.label} className={`h-1 flex-1 rounded-full ${s.done ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
              ))}
            </div>
          </div>
          <ul className="px-2 py-2">
            {cycleSteps.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  {step.done
                    ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                    : <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />}
                  <span className={`flex-1 text-sm ${step.done ? "text-slate-400 dark:text-slate-500" : "font-medium text-slate-800 dark:text-slate-200"}`}>
                    {i + 1}. {step.label}
                  </span>
                  <span className={`text-xs tabular-nums ${step.done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                    {step.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <a
              href={`/api/export/documents-zip?period=${currentPeriod}`}
              download
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Все документы {currentPeriod} (ZIP)
            </a>
          </div>
        </section>

        <Link
          href="/admin/calendar"
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          <span className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            Календарь событий
          </span>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </Link>
      </div>
    </div>
  )
}

const ACTION_TONES: Record<ActionItem["tone"], { bar: string; chip: string }> = {
  red: { bar: "bg-red-500", chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  blue: { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  violet: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
}

function ActionRow({ item }: { item: ActionItem }) {
  const tone = ACTION_TONES[item.tone]
  return (
    <li>
      <Link
        href={item.href}
        className="group relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span className={`absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r ${tone.bar}`} />
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.chip}`}>
          <item.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.sub}</span>
        </span>
        <span className="shrink-0 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{item.value}</span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-500" />
      </Link>
    </li>
  )
}

function PulseRow({
  href, icon: Icon, label, value, highlight,
}: {
  href: string
  icon: React.ElementType
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <Icon className={`h-4 w-4 shrink-0 ${highlight ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} />
      <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${highlight ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
        {value}
      </span>
    </Link>
  )
}

function HeroMetric({
  label, value, sub, tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "red" | "emerald"
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums sm:text-2xl ${
        tone === "red" ? "text-red-300" : tone === "emerald" ? "text-emerald-300" : "text-white"
      }`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{sub}</p>
    </div>
  )
}

function SlimBanner({
  href, icon: Icon, tone, title, sub, cta, progress,
}: {
  href: string
  icon: React.ElementType
  tone: "amber" | "blue"
  title: string
  sub: string
  cta: string
  progress?: number
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100",
  }
  const iconTones = {
    amber: "text-amber-600 dark:text-amber-300",
    blue: "text-blue-600 dark:text-blue-300",
  }
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition hover:shadow-sm ${tones[tone]}`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${iconTones[tone]}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs opacity-75">{sub}</span>
      </span>
      {typeof progress === "number" && (
        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/70 dark:bg-slate-800 sm:block">
          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
        {cta}
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  )
}
