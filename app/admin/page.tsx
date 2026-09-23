export const dynamic = "force-dynamic"

import { Suspense } from "react"
import { db } from "@/lib/db"
import { formatMoneyL } from "@/lib/i18n/format"
import { INTL_LOCALE } from "@/lib/i18n/config"
import { getCurrentBuildingId } from "@/lib/current-building"
import {
  Building2, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight, ArrowRight,
  Wallet, Users, LayoutDashboard,
  ClipboardCheck, ShieldCheck,
  FileSignature, ShieldAlert, CalendarClock, PiggyBank,
  CircleCheck, Download,
} from "lucide-react"
import { PageHeader, StatGrid, StatCard, Card } from "@/components/ui/page"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getOnboardingState } from "@/lib/onboarding"
import { getT } from "@/lib/i18n/server"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { safeServerValue } from "@/lib/server-fallback"
import { tenantInBuildingsWhere } from "@/lib/tenant-scope"
import { getOccupancy } from "@/lib/data/occupancy"
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
  // Все 4 пути привязки + без удалённых — как в «Аналитике» и «Финансах».
  const tenantWhereInBuilding: Prisma.TenantWhereInput = tenantInBuildingsWhere(orgId, visibleBuildingIds)
  return { floorIds, tenantWhereInBuilding }
}

// Скелет первого экрана — отдаётся мгновенно, пока стримятся базовые метрики.
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <OperationalSkeleton />
    </div>
  )
}

// Скелет «Этот месяц» + «Требует внимания» (стримятся отдельно).
function OperationalSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
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

  // Переводчик нужен и в раннем выходе «нет зданий», поэтому объявлен выше.
  const { t, tp, locale } = await getT()
  const money = (value: number) => formatMoneyL(locale, value)

  if (visibleBuildingIds.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 dark:text-slate-300 font-semibold mb-1">
          {t("adminShell.dashboard.noBuildingsTitle")}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("adminShell.dashboard.noBuildingsHint")}
        </p>
        <Link href="/admin/buildings" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {t("adminShell.dashboard.toBuildings")}
        </Link>
      </div>
    )
  }

  const { tenantWhereInBuilding } = await loadFloorScope(orgId, visibleBuildingIds)

  const [
    activeTenants,
    spacesGroup,
    chargesAgg,
    onboarding,
    currentUser2fa,
  ] = await measureServerStep("/admin", "base-metrics", Promise.all([
    safe(
      "admin.dashboard.activeTenants",
      db.tenant.findMany({
        where: tenantWhereInBuilding,
        select: {
          id: true,
          customRate: true,
          fixedMonthlyRent: true,
          rentSchedule: true,
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
        rentSchedule: string | null
        space: { area: number; floor: { ratePerSqm: number } } | null
        tenantSpaces: { space: { area: number; floor: { ratePerSqm: number } } }[]
        fullFloors: { fixedMonthlyRent: number | null }[]
      }>,
    ),
    // Заполняемость — общая формула (lib/data/occupancy): по м², без коридоров,
    // антенн и мест на крыше/территории, этаж целиком = занят.
    safe("admin.dashboard.occupancy", getOccupancy(visibleBuildingIds).then((o) => o.total), null),
    safe(
      "admin.dashboard.chargesAggregate",
      db.charge.aggregate({
        where: {
          isPaid: false,
          deletedAt: null,
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

  const occupiedSpaces = spacesGroup?.occupiedCount ?? 0
  const vacantSpaces = spacesGroup?.vacantCount ?? 0
  const occupancyPct = spacesGroup?.pct ?? 0
  const totalDebt = chargesAgg._sum.amount ?? 0
  const debtCount = chargesAgg._count._all
  const monthlyRevenue = activeTenants.reduce((sum, tenant) => {
    return sum + calculateTenantMonthlyRent(tenant)
  }, 0)

  const now = new Date()
  // Дата — на языке пользователя: «вторник, 23 сентября» ↔ «сейсенбі, 23 қыркүйек».
  const todayLabel = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Almaty",
  }).format(now)
  const need2fa = !!currentUser2fa && currentUser2fa.role === "OWNER" && !currentUser2fa.totpEnabledAt
  const needSetup = !onboarding.allDone && !!onboarding.nextStep
  // Название шага настройки живёт в словаре проверок: модуль отдаёт код шага.
  const nextStepTitle = onboarding.nextStep
    ? t(`adminChecks.onboardingSteps.steps.${onboarding.nextStep.key}.title`).toLowerCase()
    : ""

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LayoutDashboard}
        title={t("adminShell.dashboard.title")}
        subtitle={<span className="capitalize">{todayLabel} · {buildingId
            ? t("adminShell.dashboard.scopeOne")
            : t("adminShell.dashboard.scopeAll", { count: visibleBuildingIds.length })}</span>}
      />

      {/* Главные цифры: сколько денег и насколько занято здание */}
      <StatGrid>
        <StatCard
          icon={Wallet}
          tone="blue"
          label={t("adminShell.dashboard.revenue")}
          value={money(monthlyRevenue)}
          sub={t("adminShell.dashboard.revenueSub")}
          href="/admin/analytics"
        />
        <StatCard
          icon={AlertTriangle}
          tone={totalDebt > 0 ? "red" : "emerald"}
          label={t("adminShell.dashboard.debt")}
          value={money(totalDebt)}
          sub={
            debtCount > 0
              ? tp("adminShell.dashboard.debtSub", debtCount)
              : t("adminShell.dashboard.debtNone")
          }
          href="/admin/finances?chargeStatus=unpaid"
        />
        <StatCard
          icon={Building2}
          tone="teal"
          label={t("adminShell.dashboard.occupancy")}
          value={`${occupancyPct}%`}
          sub={t("adminShell.dashboard.occupancySub", {
            occupied: occupiedSpaces,
            vacant: vacantSpaces,
          })}
          href="/admin/spaces"
        />
        <StatCard
          icon={Users}
          tone="violet"
          label={t("adminShell.dashboard.tenants")}
          value={String(activeTenants.length)}
          sub={
            buildingId
              ? t("adminShell.dashboard.tenantsInBuilding")
              : t("adminShell.dashboard.tenantsAll")
          }
          href="/admin/tenants"
        />
      </StatGrid>

      {/* Незавершённая настройка — одной тонкой строкой, а не двумя плашками */}
      {(need2fa || needSetup) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
          <span className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            {t("adminShell.dashboard.setupTitle")}
          </span>
          {needSetup && onboarding.nextStep && (
            <Link href="/admin/onboarding" className="inline-flex items-center gap-1 hover:underline">
              {t("adminShell.dashboard.setupProgress", {
                percent: onboarding.percent,
                step: nextStepTitle,
              })}{}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {need2fa && (
            <Link href="/admin/profile?tab=notifications" className="inline-flex items-center gap-1 hover:underline">
              <ShieldAlert className="h-3.5 w-3.5" /> {t("adminShell.dashboard.enable2fa")}{" "}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      <Suspense fallback={<OperationalSkeleton />}>
        <DashboardOperational orgId={orgId} visibleBuildingIds={visibleBuildingIds} />
      </Suspense>

      {/* По зданиям — только когда смотрим все здания сразу */}
      {!buildingId && visibleBuildingIds.length > 1 && <DashboardLazySections />}
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
  const { t, locale } = await getT()
  const money = (value: number) => formatMoneyL(locale, value)
  const { floorIds, tenantWhereInBuilding } = await loadFloorScope(orgId, visibleBuildingIds)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in30Days = new Date(todayStart.getTime() + 30 * 24 * 3600 * 1000)

  const [
    overdueCharges,
    pendingPaymentReports,
    dataQualityIssues,
    expiringContracts,
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
      label: t("adminShell.dashboard.cycle.charges.label"),
      hint: t("adminShell.dashboard.cycle.charges.hint"),
      cta: t("adminShell.dashboard.cycle.charges.cta"),
      done: cycleCharges > 0,
      value:
        cycleCharges > 0
          ? t("adminShell.dashboard.cycle.charges.value", { count: cycleCharges })
          : t("adminShell.dashboard.cycle.charges.none"),
      href: "/admin/finances",
    },
    {
      label: t("adminShell.dashboard.cycle.invoices.label"),
      hint: t("adminShell.dashboard.cycle.invoices.hint"),
      cta: t("adminShell.dashboard.cycle.invoices.cta"),
      done: cycleActiveTenants > 0 && cycleInvoices >= cycleActiveTenants,
      value: t("adminShell.dashboard.cycle.progress", {
        done: cycleInvoices,
        total: cycleActiveTenants,
      }),
      href: "/admin/documents?create=invoice",
    },
    {
      label: t("adminShell.dashboard.cycle.acts.label"),
      hint: t("adminShell.dashboard.cycle.acts.hint"),
      cta: t("adminShell.dashboard.cycle.acts.cta"),
      done: cycleActiveTenants > 0 && cycleActs >= cycleActiveTenants,
      value: t("adminShell.dashboard.cycle.progress", {
        done: cycleActs,
        total: cycleActiveTenants,
      }),
      href: "/admin/documents?create=avr",
    },
    {
      label: t("adminShell.dashboard.cycle.payments.label"),
      hint: t("adminShell.dashboard.cycle.payments.hint"),
      cta: t("adminShell.dashboard.cycle.payments.cta"),
      done: cycleCharges > 0 && cyclePaidCharges >= cycleCharges,
      value:
        cycleCharges > 0
          ? t("adminShell.dashboard.cycle.progress", {
              done: cyclePaidCharges,
              total: cycleCharges,
            })
          : "—",
      href: "/admin/finances?chargeStatus=unpaid",
    },
  ]

  // ── Центр действий: каждый факт ровно один раз, отсортирован по срочности ──
  const actionsRaw: ActionItem[] = [
    {
      href: "/admin/finances?filter=overdue",
      title: t("adminShell.dashboard.actions.overdue.title"),
      sub:
        (overdueCharges._sum.amount ?? 0) > 0
          ? money(overdueCharges._sum.amount ?? 0)
          : t("adminShell.dashboard.actions.overdue.none"),
      value: `${overdueCharges._count._all ?? 0}`,
      icon: AlertTriangle,
      tone: "red",
      active: (overdueCharges._count._all ?? 0) > 0,
      rank: 1,
    },
    {
      href: "/admin/finances",
      title: t("adminShell.dashboard.actions.reports.title"),
      sub:
        (pendingPaymentReports._sum.amount ?? 0) > 0
          ? t("adminShell.dashboard.actions.reports.sub", {
              amount: money(pendingPaymentReports._sum.amount ?? 0),
            })
          : t("adminShell.dashboard.actions.reports.none"),
      value: `${pendingPaymentReports._count._all ?? 0}`,
      icon: Wallet,
      tone: "emerald",
      active: (pendingPaymentReports._count._all ?? 0) > 0,
      rank: 2,
    },
    {
      href: "/admin/documents",
      title: t("adminShell.dashboard.actions.signatures.title"),
      sub: t("adminShell.dashboard.actions.signatures.sub"),
      value: `${documentsOnSignature}`,
      icon: FileSignature,
      tone: "violet",
      active: documentsOnSignature > 0,
      rank: 3,
    },
    {
      href: "/admin/finances/deposits",
      title: t("adminShell.dashboard.actions.deposits.title"),
      sub:
        (unpaidDeposits._sum.amount ?? 0) > 0
          ? money(unpaidDeposits._sum.amount ?? 0)
          : t("adminShell.dashboard.actions.deposits.none"),
      value: `${unpaidDeposits._count._all ?? 0}`,
      icon: PiggyBank,
      tone: "amber",
      active: (unpaidDeposits._count._all ?? 0) > 0,
      rank: 4,
    },
    {
      href: "/admin/tenants?filter=expiring",
      title: t("adminShell.dashboard.actions.expiring.title"),
      sub: t("adminShell.dashboard.actions.expiring.sub"),
      value: `${expiringContracts}`,
      icon: CalendarClock,
      tone: "blue",
      active: expiringContracts > 0,
      rank: 5,
    },
    {
      href: "/admin/requests",
      title: t("adminShell.dashboard.actions.requests.title"),
      sub: t("adminShell.dashboard.actions.requests.sub"),
      value: `${openRequestsCount}`,
      icon: ClipboardList,
      tone: "blue",
      active: openRequestsCount > 0,
      rank: 6,
    },
    {
      href: "/admin/tasks",
      title: t("adminShell.dashboard.actions.tasks.title"),
      sub: t("adminShell.dashboard.actions.tasks.sub"),
      value: `${openTasksCount}`,
      icon: CheckSquare,
      tone: "blue",
      active: openTasksCount > 0,
      rank: 7,
    },
    {
      href: "/admin/data-quality",
      title: t("adminShell.dashboard.actions.dataQuality.title"),
      sub: t("adminShell.dashboard.actions.dataQuality.sub"),
      value: `${dataQualityIssues}`,
      icon: ShieldCheck,
      tone: "amber",
      active: dataQualityIssues > 0,
      rank: 8,
    },
  ]
  const activeActions = [...actionsRaw].filter((a) => a.active).sort((a, b) => a.rank - b.rank)
  const monthLabel = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
  }).format(now)

  return (
    <>
      {/* ── Этот месяц: четыре шага, которые закрывают любой месяц аренды ── */}
      <Card
        title={
          <span>
            {t("adminShell.dashboard.monthTitle")} ·{" "}
            <span className="capitalize">{monthLabel}</span>
          </span>
        }
        icon={CalendarClock}
        padded={false}
        actions={
          <a
            href={`/api/export/documents-zip?period=${currentPeriod}`}
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <Download className="h-3.5 w-3.5" /> {t("adminShell.dashboard.monthZip")}
          </a>
        }
      >
        <ol className="grid divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {cycleSteps.map((step, i) => (
            <li key={step.label} className="flex flex-col gap-2 p-5">
              <div className="flex items-center gap-2">
                {step.done
                  ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                  : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">{i + 1}</span>}
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.label}</span>
                <span className={`ml-auto text-xs tabular-nums ${step.done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>{step.value}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{step.hint}</p>
              <Link
                href={step.href}
                className={`mt-auto inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  step.done
                    ? "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {step.done ? t("adminShell.dashboard.open") : step.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      {/* ── Требует внимания: только то, что реально ждёт действия ── */}
      <Card title={t("adminShell.dashboard.attention")} icon={AlertTriangle} padded={false}>
        {activeActions.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6">
            <CircleCheck className="h-6 w-6 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("adminShell.dashboard.allGood")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("adminShell.dashboard.allGoodHint")}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {activeActions.map((a) => <ActionRow key={a.href + a.title} item={a} />)}
          </ul>
        )}
      </Card>
    </>
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
