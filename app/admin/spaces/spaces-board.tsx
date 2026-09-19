"use client"

// Помещения здания плитками по этажам: свободное видно сразу (зелёное), у
// занятого — арендатор и срок договора. Один переключатель «Все / Только
// свободные». Кнопки действий приходят готовыми с сервера (права проверены там).

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { Settings2 } from "lucide-react"
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
  /** Подпись под названием: ставка или «места за фиксированную сумму» */
  note: string
  wholeFloor: ReactNode | null
  /** Для зон (крыша, территория) площадь не показываем */
  isZone?: boolean
}

const area = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v)} м²`
const date = (iso: string) => new Date(iso).toLocaleDateString("ru-RU")

export function SpacesBoard({ floors, rows }: { floors: FloorGroup[]; rows: SpaceRow[] }) {
  const [onlyVacant, setOnlyVacant] = useState(false)
  const vacantCount = rows.filter((r) => r.status !== "OCCUPIED").length

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {[
          { v: false, label: `Все · ${rows.length}` },
          { v: true, label: `Только свободные · ${vacantCount}` },
        ].map((t) => (
          <button
            key={String(t.v)}
            type="button"
            onClick={() => setOnlyVacant(t.v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              onlyVacant === t.v
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {floors.map((floor) => {
        const all = rows.filter((r) => r.floorId === floor.id)
        const shown = onlyVacant ? all.filter((r) => r.status !== "OCCUPIED") : all
        if (shown.length === 0 && onlyVacant) return null
        const occupied = all.filter((r) => r.status === "OCCUPIED").length
        return (
          <section key={floor.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{floor.name}</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {floor.note} · занято {occupied} из {all.length}
              </span>
              <Link href={`/admin/floors/${floor.id}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
                <Settings2 className="h-3.5 w-3.5" /> Этаж
              </Link>
            </div>
            {floor.wholeFloor}
            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
                Здесь пока нет помещений
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {shown.map((r) => <SpaceTile key={r.id} row={r} isZone={!!floor.isZone} />)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SpaceTile({ row: r, isZone }: { row: SpaceRow; isZone: boolean }) {
  const vacant = r.status !== "OCCUPIED"
  return (
    <div
      className={`flex flex-col rounded-2xl border p-4 transition ${
        vacant
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-slate-900 dark:text-slate-100" title={r.description ?? undefined}>{r.number}</p>
          {!isZone && <p className="text-xs text-slate-500 dark:text-slate-400">{area(r.area)}</p>}
        </div>
        {vacant ? (
          <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">Свободно</span>
        ) : r.status === "MAINTENANCE" ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">Ремонт</span>
        ) : null}
      </div>

      <div className="mt-3 min-h-[40px] flex-1">
        {r.tenant ? (
          <>
            <Link href={`/admin/tenants/${r.tenant.id}`} className="line-clamp-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              {r.tenant.name}
            </Link>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {r.tenant.wholeFloor ? "этаж целиком" : r.tenant.contractEnd ? `договор до ${date(r.tenant.contractEnd)}` : "без срока договора"}
            </p>
          </>
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {isZone ? "Можно сдать" : `≈ ${formatMoney(r.rent)} в месяц`}
            {r.marketHint && <span className="block text-[11px] text-emerald-600/80 dark:text-emerald-400/80">{r.marketHint}</span>}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {r.tenant ? (
          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatMoney(r.rent)}
            {r.rentNote && <span className="ml-1 text-[11px] font-normal text-slate-400">{r.rentNote}</span>}
          </span>
        ) : <span />}
        <div className="flex flex-wrap items-center justify-end gap-2">{r.actions}</div>
      </div>
    </div>
  )
}
