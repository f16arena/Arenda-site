export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { db } from "@/lib/db"
import { getOwnerPnL } from "@/lib/reports/owner-pnl"
import { getTaxRatePercent } from "@/lib/org-features"
import { getMarketComparison } from "@/lib/market"
import { ReportView } from "./report-view"
import { MarketSection } from "./market-section"
import { PageHeader } from "@/components/ui/page"
import { FileBarChart } from "lucide-react"

type Period = "month" | "prev" | "quarter" | "year"

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "month", label: "Этот месяц" },
  { key: "prev", label: "Прошлый месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
]

function resolveRange(period: Period, now: Date): { from: Date; to: Date } {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (period) {
    case "prev":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3
      return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) }
    }
    case "year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) }
    case "month":
    default:
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) }
  }
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessible = await getAccessibleBuildingIdsForSession(orgId)
  const buildingIds = buildingId ? [buildingId] : accessible

  const sp = await searchParams
  const period = (PERIOD_TABS.some((t) => t.key === sp.period) ? sp.period : "month") as Period
  const { from, to } = resolveRange(period, new Date())

  const org = await db.organization.findUnique({ where: { id: orgId }, select: { features: true } })
  const taxRatePercent = getTaxRatePercent(org?.features)

  const [data, market] = await Promise.all([
    buildingIds.length > 0 ? getOwnerPnL({ buildingIds, from, to, taxRatePercent }) : Promise.resolve(null),
    buildingIds.length > 0 ? getMarketComparison({ buildingIds }) : Promise.resolve(null),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileBarChart}
        title="Отчётность"
        subtitle={`Доход, расход, налог и прибыль${buildingId ? " по выбранному зданию" : " по всем зданиям"}`}
        actions={
          <nav className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {PERIOD_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin/reports?period=${t.key}`}
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
        }
      />

      {data ? (
        <>
          <ReportView data={data} exportHref="/api/export/owner-report" />
          <MarketSection data={market} />
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Нет доступных зданий для отчёта
        </div>
      )}
    </div>
  )
}
