"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ElementType } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare,
  ClipboardList,
  FileSpreadsheet,
  Printer,
} from "lucide-react"

import { CashflowChart, type MonthData } from "@/components/dashboard/cashflow-chart"
import { formatMoney } from "@/lib/utils"

type BuildingMetric = {
  id: string
  name: string
  address: string
  tenantCount: number
  income: number
  expenses: number
  profit: number
  debt: number
  debtCount: number
  vacantArea: number
  totalArea: number
  occupiedArea: number
  occupancyPercent: number | null
}

type StatusItem = {
  id: string
  title: string
  status: string
}

type TopTenant = {
  id: string
  companyName: string
  debt: number
  space: { number: string } | null
  tenantSpaces: { space: { number: string } }[]
  fullFloors: { number: number; name: string }[]
}

type Payload = {
  months: MonthData[]
  buildingBreakdown: BuildingMetric[]
  recentRequests: StatusItem[]
  recentTasks: StatusItem[]
  topTenants: TopTenant[]
}

type State =
  | { loading: true; error: null; data: null }
  | { loading: false; error: string; data: null }
  | { loading: false; error: null; data: Payload }

export function DashboardLazySections({
  forecastMonthlyRevenue,
  showPortfolio,
}: {
  forecastMonthlyRevenue: number
  showPortfolio: boolean
}) {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null })

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/dashboard/secondary", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить дополнительные блоки дашборда")
        return response.json()
      })
      .then((data: Payload) => setState({ loading: false, error: null, data }))
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить дополнительные блоки дашборда",
          data: null,
        })
      })

    return () => controller.abort()
  }, [])

  const months = useMemo(() => {
    if (!state.data) return []
    const result: MonthData[] = [...state.data.months]
    const now = new Date()
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      result.push({
        period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        income: forecastMonthlyRevenue,
        expense: forecastMonthlyRevenue * 0.3,
        forecast: true,
      })
    }
    return result
  }, [forecastMonthlyRevenue, state.data])

  if (state.loading) return <SecondarySkeleton />

  if (state.error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}. Основные показатели уже загружены, попробуйте обновить страницу позже.</span>
        </div>
      </div>
    )
  }

  const data = state.data
  if (!data) return null

  return (
    <>
      {showPortfolio && data.buildingBreakdown.length > 0 && (
        <OwnerPortfolioSummary buildings={data.buildingBreakdown} />
      )}

      <CashflowChart months={months} />

      {showPortfolio && data.buildingBreakdown.length > 0 && (
        <BuildingBreakdownTable buildings={data.buildingBreakdown} />
      )}

      {(data.recentRequests.length > 0 || data.recentTasks.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatusListCard
            href="/admin/requests"
            title="Активные заявки"
            icon={ClipboardList}
            empty="Нет активных заявок"
            items={data.recentRequests}
          />
          <StatusListCard
            href="/admin/tasks"
            title="Задачи"
            icon={CheckSquare}
            empty="Нет активных задач"
            items={data.recentTasks}
          />
        </div>
      )}

      {data.topTenants.length > 0 && <TopTenantsTable tenants={data.topTenants} />}
    </>
  )
}

function SecondarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
        <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
      </div>
    </div>
  )
}

function OwnerPortfolioSummary({ buildings }: { buildings: BuildingMetric[] }) {
  const totals = buildings.reduce(
    (acc, building) => ({
      income: acc.income + building.income,
      expenses: acc.expenses + building.expenses,
      profit: acc.profit + building.profit,
      debt: acc.debt + building.debt,
      vacantArea: acc.vacantArea + building.vacantArea,
      totalArea: acc.totalArea + building.totalArea,
      occupiedArea: acc.occupiedArea + building.occupiedArea,
    }),
    { income: 0, expenses: 0, profit: 0, debt: 0, vacantArea: 0, totalArea: 0, occupiedArea: 0 },
  )
  const occupancyPercent = totals.totalArea > 0
    ? Math.round((totals.occupiedArea / totals.totalArea) * 100)
    : null
  const bestProfitBuilding = [...buildings].sort((a, b) => b.profit - a.profit)[0] ?? null
  const mostDebtBuilding = [...buildings].sort((a, b) => b.debt - a.debt)[0] ?? null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Картина владельца по всем зданиям</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {buildings.length} зданий в текущем разрезе: доход, расход, прибыль, долг и свободная площадь.
          </p>
        </div>
        <Link
          href="/api/export/owner-report?format=xlsx"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Отчет Excel
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <PortfolioStat label="Доход" value={formatMoney(totals.income)} tone="emerald" />
        <PortfolioStat label="Расход" value={formatMoney(totals.expenses)} tone="orange" />
        <PortfolioStat label="Прибыль" value={formatMoney(totals.profit)} tone={totals.profit >= 0 ? "emerald" : "red"} />
        <PortfolioStat label="Долг" value={totals.debt > 0 ? formatMoney(totals.debt) : "Нет"} tone={totals.debt > 0 ? "red" : "slate"} />
        <PortfolioStat label="Свободно" value={formatArea(totals.vacantArea)} tone="blue" />
        <PortfolioStat label="Заполняемость" value={occupancyPercent === null ? "—" : `${occupancyPercent}%`} tone="slate" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Лучшее здание по прибыли: <b>{bestProfitBuilding ? `${bestProfitBuilding.name} · ${formatMoney(bestProfitBuilding.profit)}` : "данных пока нет"}</b>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Самый большой долг: <b>{mostDebtBuilding && mostDebtBuilding.debt > 0 ? `${mostDebtBuilding.name} · ${formatMoney(mostDebtBuilding.debt)}` : "критичных долгов нет"}</b>
        </div>
      </div>
    </section>
  )
}

function PortfolioStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "emerald" | "orange" | "red" | "blue" | "slate"
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    orange: "text-orange-600 dark:text-orange-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-slate-900 dark:text-slate-100",
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className={`truncate text-lg font-bold ${colors[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function BuildingBreakdownTable({ buildings }: { buildings: BuildingMetric[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Разрез по зданиям за текущий месяц</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Доход, расход, прибыль, долг и свободная площадь по каждой точке.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/export/owner-report?format=xlsx" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Link>
          <Link href="/api/export/owner-report?format=html" target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <Printer className="h-4 w-4" />
            PDF/печать
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Доход</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Расход</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Прибыль</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Долг</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Свободно</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Заполняемость</th>
            </tr>
          </thead>
          <tbody>
            {buildings.map((building) => (
              <tr key={building.id} className="border-b border-slate-50 dark:border-slate-800/70">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{building.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{building.address} · {building.tenantCount} арендаторов</p>
                </td>
                <td className="px-5 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(building.income)}</td>
                <td className="px-5 py-3 text-right font-medium text-orange-600 dark:text-orange-400">{formatMoney(building.expenses)}</td>
                <td className={`px-5 py-3 text-right font-semibold ${building.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{formatMoney(building.profit)}</td>
                <td className={`px-5 py-3 text-right font-medium ${building.debt > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                  {building.debt > 0 ? formatMoney(building.debt) : "—"}
                  {building.debtCount > 0 && <span className="block text-[11px] font-normal text-slate-400">{building.debtCount} шт</span>}
                </td>
                <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">{formatArea(building.vacantArea)}</td>
                <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">{building.occupancyPercent !== null ? `${building.occupancyPercent}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusListCard({
  href,
  title,
  icon: Icon,
  empty,
  items,
}: {
  href: string
  title: string
  icon: ElementType
  empty: string
  items: StatusItem[]
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          {title}
        </h2>
        <Link href={href} className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline dark:text-blue-400">
          Все <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700 dark:text-slate-300">{item.title}</span>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TopTenantsTable({ tenants }: { tenants: TopTenant[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Арендаторы</h2>
        <Link href="/admin/tenants" className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline dark:text-blue-400">
          Все <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Компания</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Помещение</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Долг</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/50">
              <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{tenant.companyName}</td>
              <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{describeTenantPlacement(tenant)}</td>
              <td className="px-5 py-3 text-right">
                {tenant.debt > 0 ? (
                  <span className="font-medium text-red-600 dark:text-red-400">{formatMoney(tenant.debt)}</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">Нет долга</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function describeTenantPlacement(tenant: {
  space: { number: string } | null
  tenantSpaces: { space: { number: string } }[]
  fullFloors: { number: number; name: string }[]
}) {
  if (tenant.fullFloors.length > 0) {
    return tenant.fullFloors.map((floor) => floor.name || `${floor.number} этаж`).join(", ")
  }

  const rooms = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space.number)
    : tenant.space
      ? [tenant.space.number]
      : []

  return rooms.length > 0 ? rooms.map((number) => `Каб. ${number}`).join(", ") : "—"
}

function formatArea(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} м²`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    DONE: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  }
  const label: Record<string, string> = {
    NEW: "Новая",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
      {label[status] ?? status}
    </span>
  )
}
