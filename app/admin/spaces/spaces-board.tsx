"use client"

// Таблица помещений здания: одна на всё здание, этажи — строки-заголовки.
// Фильтры «Все / Свободные / Занятые», этаж и поиск работают без перезагрузки.
// Кнопки действий (изменить, заселить, krisha, удалить) приходят готовыми с
// сервера — права на них проверены там.

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Search, Settings2, Layers } from "lucide-react"
import { formatMoney } from "@/lib/utils"

export type SpaceRow = {
  id: string
  number: string
  floorId: string
  area: number
  status: string
  description: string | null
  tenant: { id: string; name: string; contractEnd: string | null; wholeFloor: boolean } | null
  /** Аренда в месяц: фактическая у занятых, по ставке этажа — у свободных */
  rent: number
  rentNote: string | null
  marketHint: string | null
  actions: ReactNode
}

export type FloorGroup = {
  id: string
  name: string
  rate: number
  totalArea: number | null
  wholeFloor: ReactNode | null
}

type Filter = "all" | "vacant" | "occupied"

const STATUS: Record<string, { label: string; cls: string }> = {
  VACANT: { label: "Свободно", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  OCCUPIED: { label: "Занято", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  MAINTENANCE: { label: "На ремонте", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
}

const area = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v)} м²`
const date = (iso: string) => new Date(iso).toLocaleDateString("ru-RU")

export function SpacesBoard({ floors, rows, initialFilter }: { floors: FloorGroup[]; rows: SpaceRow[]; initialFilter: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [floorId, setFloorId] = useState<string>("all")
  const [q, setQ] = useState("")

  const counts = useMemo(() => ({
    all: rows.length,
    vacant: rows.filter((r) => r.status !== "OCCUPIED").length,
    occupied: rows.filter((r) => r.status === "OCCUPIED").length,
  }), [rows])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "vacant" && r.status === "OCCUPIED") return false
      if (filter === "occupied" && r.status !== "OCCUPIED") return false
      if (floorId !== "all" && r.floorId !== floorId) return false
      if (needle && ![r.number, r.description ?? "", r.tenant?.name ?? ""].some((s) => s.toLowerCase().includes(needle))) return false
      return true
    })
  }, [rows, filter, floorId, q])

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: `Все · ${counts.all}` },
    { key: "vacant", label: `Свободные · ${counts.vacant}` },
    { key: "occupied", label: `Занятые · ${counts.occupied}` },
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Фильтры */}
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 lg:flex-row lg:items-center">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === t.key
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={floorId}
          onChange={(e) => setFloorId(e.target.value)}
          aria-label="Этаж"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="all">Все этажи</option>
          {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <label className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Номер, арендатор, описание"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          {rows.length === 0 ? "В здании пока нет помещений — добавьте первое кнопкой вверху." : "Под фильтр ничего не подходит."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-2.5">Помещение</th>
                <th className="px-3 py-2.5 text-right">Площадь</th>
                <th className="px-3 py-2.5 text-right">Аренда в месяц</th>
                <th className="px-3 py-2.5">Арендатор</th>
                <th className="px-3 py-2.5">Статус</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            {floors.map((floor) => {
              const floorRows = visible.filter((r) => r.floorId === floor.id)
              if (floorRows.length === 0) return null
              const all = rows.filter((r) => r.floorId === floor.id)
              const occupied = all.filter((r) => r.status === "OCCUPIED").length
              return (
                <tbody key={floor.id}>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                    <td colSpan={6} className="px-5 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />{floor.name}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">ставка аренды {formatMoney(floor.rate)} за м²</span>
                        {floor.totalArea ? <span className="text-slate-500 dark:text-slate-400">площадь этажа {area(floor.totalArea)}</span> : null}
                        <span className="text-slate-500 dark:text-slate-400">занято {occupied} из {all.length}</span>
                        <Link href={`/admin/floors/${floor.id}`} className="ml-auto inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">
                          <Settings2 className="h-3.5 w-3.5" /> Настройки этажа
                        </Link>
                      </div>
                      {floor.wholeFloor}
                    </td>
                  </tr>
                  {floorRows.map((r) => {
                    const st = STATUS[r.status] ?? { label: r.status, cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" }
                    return (
                      <tr key={r.id} className="border-b border-slate-50 align-top hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{r.number}</p>
                          {r.description && <p className="max-w-[260px] truncate text-xs text-slate-400 dark:text-slate-500" title={r.description}>{r.description}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{area(r.area)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <p className={r.tenant ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
                            {r.tenant ? formatMoney(r.rent) : `≈ ${formatMoney(r.rent)}`}
                          </p>
                          {r.rentNote && <p className="text-[11px] text-slate-400 dark:text-slate-500">{r.rentNote}</p>}
                          {r.marketHint && <p className="text-[11px] text-emerald-600 dark:text-emerald-400" title="Медиана рынка по городу (krisha)">{r.marketHint}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.tenant ? (
                            <>
                              <Link href={`/admin/tenants/${r.tenant.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{r.tenant.name}</Link>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                {r.tenant.wholeFloor ? "этаж целиком" : ""}
                                {r.tenant.wholeFloor && r.tenant.contractEnd ? " · " : ""}
                                {r.tenant.contractEnd ? `договор до ${date(r.tenant.contractEnd)}` : ""}
                              </p>
                            </>
                          ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex flex-wrap items-center justify-end gap-2">{r.actions}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
        </div>
      )}
    </section>
  )
}
