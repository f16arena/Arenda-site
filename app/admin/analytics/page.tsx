export const dynamic = "force-dynamic"

// «Аналитика» — одна страница вместо трёх вкладок (Аналитика / Финансовый
// дашборд / Отчётность), которые показывали одно и то же — доход, заполняемость,
// должников, прогноз — но считали по-разному, и цифры не сходились.
// Сверху — деньги за период (доход, расход, налог, прибыль, динамика),
// ниже — арендаторы и площади, сравнение зданий и рынок.

import Link from "next/link"
import { redirect } from "next/navigation"
import { Activity, AlertCircle, Award, Building2, DoorOpen, Lock, SquareDashed } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { safeServerValue } from "@/lib/server-fallback"
import { tenantInBuildingsWhere } from "@/lib/tenant-scope"
import { getOwnerPnL } from "@/lib/reports/owner-pnl"
import { getTaxRatePercent } from "@/lib/org-features"
import { getMarketComparison } from "@/lib/market"
import { REPORT_PERIODS, parseReportPeriod, reportPeriodCaption, resolveReportRange } from "@/lib/reports/period"
import { shortCompanyName } from "@/lib/company-name"
import { PageHeader, StatGrid, StatCard, Card, Section } from "@/components/ui/page"
import { ReportView } from "./report-view"
import { MarketSection } from "./market-section"

type Features = { analyticsBasic?: boolean; analyticsAdvanced?: boolean }

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
  try { features = JSON.parse(org?.plan?.features ?? "{}") as Features } catch { /* битый JSON тарифа — без доп. блоков */ }
  const basic = !!features.analyticsBasic
  const advanced = !!features.analyticsAdvanced

  const tenantWhere = tenantInBuildingsWhere(orgId, buildingIds)
  // Оплаты считаем и от удалённых арендаторов: деньги-то поступили.
  const { deletedAt: _ignored, ...tenantWhereWithArchived } = tenantWhere
  void _ignored

  const [pnl, market, spaces, payersAgg, debtorsAgg, overdue, buildings] = await Promise.all([
    getOwnerPnL({ buildingIds, from, to, taxRatePercent: getTaxRatePercent(org?.features) }),
    getMarketComparison({ buildingIds }),
    basic
      ? safe(
          "admin.analytics.spaces",
          db.space.findMany({
            // Объекты без площади (антенна, щит) в заполняемость по м² не входят.
            where: { floor: { buildingId: { in: buildingIds } }, kind: { not: "OBJECT" } },
            select: { area: true, status: true, floor: { select: { buildingId: true } } },
          }),
          [] as Array<{ area: number; status: string; floor: { buildingId: string } }>,
        )
      : Promise.resolve([] as Array<{ area: number; status: string; floor: { buildingId: string } }>),
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
            take: 10,
          }),
          [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
        )
      : Promise.resolve([] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
    advanced
      ? safe(
          "admin.analytics.overdue",
          db.charge.findMany({
            where: { isPaid: false, deletedAt: null, dueDate: { lt: now }, tenant: tenantWhere },
            select: { amount: true, dueDate: true },
          }),
          [] as Array<{ amount: number; dueDate: Date | null }>,
        )
      : Promise.resolve([] as Array<{ amount: number; dueDate: Date | null }>),
    advanced && buildingIds.length > 1
      ? safe(
          "admin.analytics.buildings",
          db.building.findMany({ where: { id: { in: buildingIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
          [] as Array<{ id: string; name: string }>,
        )
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ])

  // ── Площади ──
  const totalArea = spaces.reduce((s, x) => s + x.area, 0)
  const occupiedArea = spaces.filter((x) => x.status === "OCCUPIED").reduce((s, x) => s + x.area, 0)
  const vacant = spaces.filter((x) => x.status === "VACANT")
  const vacantArea = vacant.reduce((s, x) => s + x.area, 0)
  const occupancyPct = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 100) : 0
  const m2 = (v: number) => `${Math.round(v).toLocaleString("ru-RU")} м²`

  // ── Имена арендаторов для топов ──
  const nameIds = [...new Set([...payersAgg, ...debtorsAgg].map((r) => r.tenantId))]
  const names = nameIds.length
    ? await safe(
        "admin.analytics.names",
        db.tenant.findMany({ where: { id: { in: nameIds } }, select: { id: true, companyName: true } }),
        [] as Array<{ id: string; companyName: string }>,
      )
    : []
  const nameOf = (id: string) => shortCompanyName(names.find((n) => n.id === id)?.companyName ?? "—")
  const payersTotal = payersAgg.reduce((s, r) => s + (r._sum.amount ?? 0), 0)
  const debtTotal = debtorsAgg.reduce((s, r) => s + (r._sum.amount ?? 0), 0)

  // ── Возраст долга ──
  const aging = [
    { label: "до 30 дней", v: 0, cls: "text-amber-600 dark:text-amber-400" },
    { label: "30–60", v: 0, cls: "text-orange-600 dark:text-orange-400" },
    { label: "60–90", v: 0, cls: "text-red-600 dark:text-red-400" },
    { label: "90+", v: 0, cls: "text-red-700 dark:text-red-500" },
  ]
  for (const c of overdue) {
    if (!c.dueDate) continue
    const days = Math.floor((now.getTime() - c.dueDate.getTime()) / 86_400_000)
    aging[days < 30 ? 0 : days < 60 ? 1 : days < 90 ? 2 : 3].v += c.amount
  }

  // ── Сравнение зданий (если их несколько) ──
  const buildingRows = await Promise.all(
    buildings.map(async (b) => {
      const where = tenantInBuildingsWhere(orgId, [b.id])
      const { deletedAt: _d, ...withArchived } = where
      void _d
      const [rev, exp] = await Promise.all([
        db.payment.aggregate({
          where: { paymentDate: { gte: from, lt: to }, deletedAt: null, tenant: withArchived },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 as number | null } })),
        db.expense.aggregate({
          where: { buildingId: b.id, date: { gte: from, lt: to } },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 as number | null } })),
      ])
      const own = spaces.filter((s) => s.floor.buildingId === b.id)
      const area = own.reduce((s, x) => s + x.area, 0)
      const occ = own.filter((x) => x.status === "OCCUPIED").reduce((s, x) => s + x.area, 0)
      const received = rev._sum.amount ?? 0
      const spent = exp._sum.amount ?? 0
      return { ...b, area, pct: area > 0 ? Math.round((occ / area) * 100) : 0, received, spent }
    }),
  )

  const periodNav = (
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
  )

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Аналитика"
        subtitle={`Сколько заработали, куда ушло и кто должен — ${caption}${buildingId ? "" : buildingIds.length > 1 ? " · все здания" : ""}`}
        actions={periodNav}
      />

      {pnl ? (
        <ReportView data={pnl} exportHref="/api/export/owner-report" />
      ) : (
        <Card><p className="text-center text-sm text-slate-500 dark:text-slate-400">Нет данных за период</p></Card>
      )}

      {basic ? (
        <Section title="Арендаторы и площади" icon={Building2}>
          <StatGrid cols={2}>
            <StatCard
              icon={Building2}
              tone="blue"
              label="Сдано площади"
              value={`${occupancyPct}%`}
              sub={`${m2(occupiedArea)} из ${m2(totalArea)} · без антенн и щитов`}
            />
            <StatCard
              icon={DoorOpen}
              tone={vacant.length > 0 ? "amber" : "emerald"}
              label="Свободно сейчас"
              value={vacant.length > 0 ? m2(vacantArea) : "Всё сдано"}
              sub={vacant.length > 0 ? `${vacant.length} помещ. — открыть список` : undefined}
              href={vacant.length > 0 ? "/admin/spaces" : undefined}
            />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card padded={false} icon={Award} title={`Больше всех заплатили ${caption}`}>
              {payersAgg.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Оплат за период нет</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payersAgg.map((r) => {
                    const amount = r._sum.amount ?? 0
                    const share = pnl && pnl.cashIncome > 0 ? Math.round((amount / pnl.cashIncome) * 100) : null
                    return (
                      <li key={r.tenantId}>
                        <Link href={`/admin/tenants/${r.tenantId}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{nameOf(r.tenantId)}</span>
                          {share !== null && <span className="text-xs text-slate-400 dark:text-slate-500">{share}%</span>}
                          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(amount)}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
              {payersAgg.length > 0 && (
                <p className="border-t border-slate-100 px-5 py-2 text-[11.5px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  Вместе {formatMoney(payersTotal)} — % от всех поступлений за период
                </p>
              )}
            </Card>

            <Card padded={false} icon={AlertCircle} title="Кто должен сейчас">
              {debtorsAgg.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Должников нет</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {debtorsAgg.map((r) => (
                    <li key={r.tenantId}>
                      <Link href={`/admin/tenants/${r.tenantId}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{nameOf(r.tenantId)}</span>
                        <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(r._sum.amount ?? 0)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {advanced && overdue.length > 0 && (
                <div className="grid grid-cols-4 gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                  {aging.map((a) => (
                    <div key={a.label} className="min-w-0">
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">просрочка {a.label}</p>
                      <p className={`truncate text-sm font-semibold tabular-nums ${a.v > 0 ? a.cls : "text-slate-300 dark:text-slate-600"}`}>{formatMoney(a.v)}</p>
                    </div>
                  ))}
                </div>
              )}
              {debtorsAgg.length > 0 && (
                <p className="border-t border-slate-100 px-5 py-2 text-[11.5px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  Топ-{debtorsAgg.length}: {formatMoney(debtTotal)} ·{" "}
                  <Link href="/admin/finances" className="underline hover:text-slate-600 dark:hover:text-slate-300">все долги в «Финансах»</Link>
                </p>
              )}
            </Card>
          </div>
        </Section>
      ) : null}

      {buildingRows.length > 1 && (
        <Card padded={false} className="overflow-x-auto" icon={SquareDashed} title={`Сравнение зданий ${caption}`}>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-2 text-left font-medium">Здание</th>
                <th className="px-5 py-2 text-right font-medium">Площадь</th>
                <th className="px-5 py-2 text-right font-medium">Сдано</th>
                <th className="px-5 py-2 text-right font-medium">Поступило</th>
                <th className="px-5 py-2 text-right font-medium">Расходы</th>
                <th className="px-5 py-2 text-right font-medium">Итог</th>
              </tr>
            </thead>
            <tbody>
              {buildingRows.map((b) => {
                const result = b.received - b.spent
                return (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{b.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{m2(b.area)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{b.pct}%</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(b.received)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{b.spent > 0 ? formatMoney(b.spent) : "не внесены"}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${result >= 0 ? "text-slate-900 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`}>{formatMoney(result)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <MarketSection data={market} />

      {(!basic || !advanced) && (
        <p className="flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {!basic
            ? "Топ плательщиков, должники и заполняемость по площади — на тарифе Pro."
            : "Возраст долга и сравнение зданий — на тарифе Business."}{" "}
          <Link href="/admin/subscription" className="underline hover:text-slate-600 dark:hover:text-slate-300">Тарифы</Link>
        </p>
      )}
    </div>
  )
}
