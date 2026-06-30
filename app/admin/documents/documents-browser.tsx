"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { DocumentsTableLoader } from "./documents-table-loader"
import type { DocRow } from "./documents-table"

const TYPES = [
  { value: "ALL", label: "Все" },
  { value: "CONTRACT", label: "Договоры" },
  { value: "INVOICE", label: "Счета" },
  { value: "ACT", label: "Акты услуг" },
  { value: "RECONCILIATION", label: "Акты сверки" },
  { value: "HANDOVER", label: "Приём-передача" },
]

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "АВР",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const PAGE_SIZE = 30

/**
 * Клиентский браузер документов: фильтр по типу, поиск, период и пагинация —
 * всё в памяти, без обращения к серверу на каждый клик. Сервер один раз отдаёт
 * полный набор строк, дальше страница работает мгновенно.
 */
export function DocumentsBrowser({
  rows,
  initialType = "ALL",
  initialSearch = "",
  initialPeriod = "",
  canSign = false,
  canExportZip = false,
}: {
  rows: DocRow[]
  initialType?: string
  initialSearch?: string
  initialPeriod?: string
  /** Право на подпись ЭЦП (NCALayer). */
  canSign?: boolean
  /** Право скачивать ZIP-архив документов. */
  canExportZip?: boolean
}) {
  const [type, setType] = useState(initialType.toUpperCase())
  const [q, setQ] = useState(initialSearch)
  const [period, setPeriod] = useState(initialPeriod)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (type !== "ALL" && r.type !== type) return false
      if (period && r.period !== period) return false
      if (lower && !(r.tenantName.toLowerCase().includes(lower) || (r.number ?? "").toLowerCase().includes(lower))) return false
      return true
    })
  }, [rows, type, q, period])

  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pages)
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const from = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  const to = Math.min(total, current * PAGE_SIZE)

  function changeType(value: string) {
    setType(value)
    setPage(1)
  }
  function changeSearch(value: string) {
    setQ(value)
    setPage(1)
  }
  function changePeriod(value: string) {
    setPeriod(value)
    setPage(1)
  }
  function reset() {
    setQ("")
    setPeriod("")
    setPage(1)
  }

  const hasFilters = type !== "ALL" || !!q || !!period
  const emptyHint = hasFilters
    ? "По вашим фильтрам ничего не найдено"
    : "Документы ещё не созданы. Нажмите «Создать документ» и выберите тип."

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {total} {total === 1 ? "документ" : "документов"}
        {type !== "ALL" ? ` · тип «${TYPE_LABELS[type] ?? type}»` : ""}
        {period ? ` · период ${period}` : ""}
      </p>

      {/* Фильтры */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                type === t.value
                  ? "bg-slate-900 text-white"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Поиск по контрагенту или номеру..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <input
            type="month"
            value={period}
            onChange={(e) => changePeriod(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {(q || period) && (
            <button
              onClick={reset}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      <DocumentsTableLoader rows={pageRows} emptyHint={emptyHint} canSign={canSign} canExportZip={canExportZip} />

      {pages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-1 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Показано {from}-{to} из {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:disabled:text-slate-600"
            >
              Назад
            </button>
            <span className="px-2 text-xs text-slate-500 dark:text-slate-400">
              {current} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={current >= pages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:disabled:text-slate-600"
            >
              Далее
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
