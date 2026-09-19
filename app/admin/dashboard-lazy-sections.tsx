"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertTriangle, FileSpreadsheet, Printer } from "lucide-react"

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

type Payload = {
  buildingBreakdown: BuildingMetric[]
}

type State =
  | { loading: true; error: null; data: null }
  | { loading: false; error: string; data: null }
  | { loading: false; error: null; data: Payload }

/**
 * Разрез по зданиям на обзоре — только когда владелец смотрит все здания сразу.
 * График движения денег и списки арендаторов/заявок отсюда убраны: они живут
 * на своих страницах («Аналитика», «Арендаторы», «Заявки»), обзор не дублирует.
 */
export function DashboardLazySections() {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null })

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/dashboard/secondary", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить разрез по зданиям")
        return response.json()
      })
      .then((data: Payload) => setState({ loading: false, error: null, data }))
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Не удалось загрузить разрез по зданиям",
          data: null,
        })
      })
    return () => controller.abort()
  }, [])

  if (state.loading) {
    return <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
  }
  if (state.error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}. Остальной обзор уже загружен, попробуйте обновить страницу позже.</span>
        </div>
      </div>
    )
  }
  const buildings = state.data?.buildingBreakdown ?? []
  return buildings.length > 0 ? <BuildingBreakdownTable buildings={buildings} /> : null
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

function formatArea(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} м²`
}
