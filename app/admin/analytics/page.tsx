export const dynamic = "force-dynamic"

// «Аналитика» — просто и крупно (решение владельца 20.09.2026):
// четыре главные цифры, один график по месяцам, кто должен и кто больше платит.
// Водопад, пончики, налог, собираемость и рынок убраны — это бухгалтерская
// отчётность, она остаётся в выгрузке Excel.
// Раньше здесь было три вкладки (Аналитика / Финансовый дашборд / Отчётность),
// которые считали одно и то же по-разному.

import Link from "next/link"
import { redirect } from "next/navigation"
import { Activity, AlertCircle, Award, Building2, Download, TrendingUp, Wallet } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { safeServerValue } from "@/lib/server-fallback"
import { tenantInBuildingsWhere } from "@/lib/tenant-scope"
import { getOccupancy } from "@/lib/data/occupancy"
import { RENT_INPUT_SELECT } from "@/lib/data/rent"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getOwnerPnL } from "@/lib/reports/owner-pnl"
import { getTaxRatePercent } from "@/lib/org-features"
import { REPORT_PERIODS, parseReportPeriod, reportPeriodCaption, resolveReportRange } from "@/lib/reports/period"
import { shortCompanyName } from "@/lib/company-name"
import { PageHeader, StatGrid, StatCard, Card } from "@/components/ui/page"
import { IncomeExpenseChart } from "./charts"

type Features = { analyticsBasic?: boolean }

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/analytics", orgId, userId: session.user.id })

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const buildingIds = buildingId ? [buildingId] : accessibleBuildingIds
  if (buildingIds.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Нет доступных зданий
      </div>
    )
  }

  const sp = await searchParams
  const period = parseReportPeriod(sp.period)
  const now = new Date()
  const { from, to } = resolveReportRange(period, now)
  const caption = reportPeriodCaption(period, now)

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { features: true, plan: { select: { features: true } } },
  })
  let features: Features = {}
  try { features = JSON.parse(org?.plan?.features ?? "{}") as Features } catch { /* битый JSON тарифа */ }
  const basic = !!features.analyticsBasic

  const tenantWhere = tenantInBuildingsWhere(orgId, buildingIds)
  // Оплаты считаем и от удалённых арендаторов: деньги-то поступили.
  const { deletedAt: _ignored, ...tenantWhereWithArchived } = tenantWhere
  void _ignored

  const [pnl, occupancy, debtAgg, activeTenants, payersAgg, debtorsAgg] = await Promise.all([
    getOwnerPnL({ buildingIds, from, to, taxRatePercent: getTaxRatePercent(org?.features) }),
    safe("admin.analytics.occupancy", getOccupancy(buildingIds), null),
    safe(
      "admin.analytics.debt",
      db.charge.aggregate({ where: { isPaid: false, deletedAt: null, tenant: tenantWhere }, _sum: { amount: true }, _count: { _all: true } }),
      { _sum: { amount: 0 as number | null }, _count: { _all: 0 } },
    ),
    // Ожидаемая аренда — по действующим договорам. AND, не spread: иначе
    // условие срока затирало фильтр здания (правка 20.09).
    safe(
      "admin.analytics.activeTenants",
      db.tenant.findMany({
        where: { AND: [tenantWhere, { OR: [{ contractEnd: null }, { contractEnd: { gte: now } }] }] },
        select: RENT_INPUT_SELECT,
      }),
      [],
    ),
    basic
      ? safe(
          "admin.analytics.payers",
          db.payment.groupBy({
            by: ["tenantId"],
            where: { paymentDate: { gte: from, lt: to }, deletedAt: null, tenant: tenantWhereWithArchived },
            _sum: { amount: true },
            orderBy: { _sum: { amount: "desc" } },
            take: 5,
          }),
          [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
        )
      : Promise.resolve([] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
    basic
      ? safe(
          "admin.analytics.debtors",
          db.charge.groupBy({
            by: ["tenantId"],
            where: { isPaid: false, deletedAt: null, tenant: tenantWhere },
            _sum: { amount: true },
            orderBy: { _sum: { amount: "desc" } },
            take: 5,
          }),
          [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
        )
      : Promise.resolve([] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
  ])

  const received = pnl?.cashIncome ?? 0
  const expense = pnl?.expense ?? 0
  const debt = debtAgg._sum.amount ?? 0
  const expectedMonthly = activeTenants.reduce((sum, t) => sum + calculateTenantMonthlyRent(t), 0)
  const occ = occupancy?.total
  const m2 = (v: number) => `${Math.round(v).toLocaleString("ru-RU")} м²`

  const months = (pnl?.monthly ?? []).map((m) => ({
    label: m.label,
    income: m.cashIncome,
    expense: m.expense,
    net: m.cashIncome - m.expense,
  }))

  const nameIds = [...new Set([...payersAgg, ...debtorsAgg].map((r) => r.tenantId))]
  const names = nameIds.length
    ? await safe(
        "admin.analytics.names",
        db.tenant.findMany({ where: { id: { in: nameIds } }, select: { id: true, companyName: true } }),
        [] as Array<{ id: string; companyName: string }>,
      )
    : []
  const nameOf = (id: string) => shortCompanyName(names.find((n) => n.id === id)?.companyName ?? "—")

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Аналитика"
        subtitle={`${caption}${buildingId ? "" : buildingIds.length > 1 ? " · все здания" : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <nav className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {REPORT_PERIODS.map((t) => (
                <Link
                  key={t.key}
                  href={`/admin/analytics?period=${t.key}`}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    period === t.key
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <a
              href="/api/export/owner-report"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" /> Отчёт в Excel
            </a>
          </div>
        }
      />

      {/* Четыре главные цифры */}
      <StatGrid>
        <StatCard
          icon={TrendingUp}
          tone="emerald"
          label={`Поступило ${caption}`}
          value={formatMoney(received)}
          sub={expense > 0 ? `расходы ${formatMoney(expense)} · осталось ${formatMoney(received - expense)}` : "расходы не внесены"}
          href="/admin/finances"
        />
        <StatCard
          icon={AlertCircle}
          tone={debt > 0 ? "red" : "emerald"}
          label="Должны сейчас"
          value={formatMoney(debt)}
          sub={debtAgg._count._all > 0 ? `${debtAgg._count._all} неоплаченных начислений` : "долгов нет"}
          href="/admin/finances"
        />
        <StatCard
          icon={Wallet}
          tone="blue"
          label="Ожидается в месяц"
          value={formatMoney(expectedMonthly)}
          sub={`по ${activeTenants.length} действующим договорам`}
          href="/admin/tenants"
        />
        <StatCard
          icon={Building2}
          tone="violet"
          label="Сдано площади"
          value={`${occ?.pct ?? 0}%`}
          sub={occ ? `${m2(occ.occupiedArea)} из ${m2(occ.totalArea)} · свободно ${occ.vacantCount}` : undefined}
          href="/admin/spaces"
        />
      </StatGrid>

      {/* Один график: поступления и расходы по месяцам */}
      <Card icon={TrendingUp} title="По месяцам — поступления и расходы">
        {months.length > 0 ? (
          <IncomeExpenseChart months={months} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Пока нет данных</p>
        )}
      </Card>

      {basic && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card padded={false} icon={AlertCircle} title="Кто должен">
            {debtorsAgg.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Должников нет</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {debtorsAgg.map((r) => (
                  <li key={r.tenantId}>
                    <Link href={`/admin/tenants/${r.tenantId}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{nameOf(r.tenantId)}</span>
                      <span className="text-base font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(r._sum.amount ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padded={false} icon={Award} title={`Кто больше платит ${caption}`}>
            {payersAgg.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Оплат за период нет</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {payersAgg.map((r) => (
                  <li key={r.tenantId}>
                    <Link href={`/admin/tenants/${r.tenantId}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{nameOf(r.tenantId)}</span>
                      <span className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(r._sum.amount ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
