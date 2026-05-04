"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Download, FileText, Archive, Loader2, ChevronDown, ChevronRight,
  List, Folder, Trash2, Lock,
} from "lucide-react"
import { toast } from "sonner"
import { deleteAdminDocument } from "@/app/actions/documents"
import { formatMoney } from "@/lib/utils"

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "Акт оказанных услуг",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const TYPE_COLORS: Record<string, string> = {
  CONTRACT: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300",
  INVOICE: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ACT: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300",
  RECONCILIATION: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  HANDOVER: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
}

export interface DocRow {
  id: string
  type: string
  number: string | null
  tenantName: string
  tenantId: string | null
  period: string | null
  totalAmount: number | null
  generatedAt: Date | string
  source: "contract" | "generated"
  downloadHref: string | null
  /** Для bulk: GeneratedDocument id (без префикса) */
  generatedId?: string
  deleteId?: string
  canDelete?: boolean
  isSigned?: boolean
}

export function DocumentsTable({ rows, emptyHint }: { rows: DocRow[]; emptyHint: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [groupBy, setGroupBy] = useState<"none" | "tenant">("none")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)

  // Группируем по tenantName (или "Без контрагента")
  const grouped = useMemo(() => {
    if (groupBy !== "tenant") return null
    const map = new Map<string, { tenantId: string | null; rows: DocRow[] }>()
    for (const r of rows) {
      const key = r.tenantName || "Без контрагента"
      if (!map.has(key)) map.set(key, { tenantId: r.tenantId, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [groupBy, rows])

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setCollapsedGroups(next)
  }

  // Только сгенерированные доки (с скачиваемым файлом) можно выделять
  const selectableRows = rows.filter((r) => r.generatedId)

  function toggle(genId: string) {
    const next = new Set(selected)
    if (next.has(genId)) next.delete(genId)
    else next.add(genId)
    setSelected(next)
  }

  function toggleAll() {
    if (selected.size === selectableRows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableRows.map((r) => r.generatedId!)))
    }
  }

  function downloadArchive() {
    if (selected.size === 0) return
    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/bulk-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected) }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || "Не удалось собрать архив")
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `documents_${new Date().toISOString().slice(0, 10)}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success(`Скачан архив из ${selected.size} документов`)
        setSelected(new Set())
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  function handleDelete(row: DocRow) {
    if (!row.deleteId || !row.canDelete) return
    const number = row.number ? ` № ${row.number}` : ""
    const signedWarning = row.isSigned
      ? "Документ уже подписан. Удаление подписанного документа доступно только владельцу.\n\n"
      : ""
    const confirmed = window.confirm(
      `${signedWarning}Удалить ${TYPE_LABELS[row.type] ?? "документ"}${number}?\n\nДействие нельзя отменить. Если документ нужен с изменениями, его нужно будет создать заново.`
    )
    if (!confirmed) return

    setDeletingRowId(row.id)
    startTransition(async () => {
      const result = await deleteAdminDocument({ source: row.source, id: row.deleteId! })
      setDeletingRowId(null)
      if (!result.ok) {
        toast.error(result.error ?? "Не удалось удалить документ")
        return
      }
      if (row.generatedId) {
        const nextSelected = new Set(selected)
        nextSelected.delete(row.generatedId)
        setSelected(nextSelected)
      }
      toast.success("Документ удалён")
      router.refresh()
    })
  }

  function renderActions(row: DocRow) {
    const isDeleting = deletingRowId === row.id && pending
    return (
      <div className="flex items-center justify-end gap-2">
        {row.downloadHref ? (
          <a
            href={row.downloadHref}
            download
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <Download className="h-3 w-3" />
            Скачать
          </a>
        ) : (
          <Link
            href={`/admin/tenants/${row.tenantId}`}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Открыть →
          </Link>
        )}
        {row.deleteId && row.canDelete ? (
          <button
            type="button"
            onClick={() => handleDelete(row)}
            disabled={isDeleting}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            title={row.isSigned ? "Удалить подписанный документ может только владелец" : "Удалить ошибочно созданный документ"}
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Удалить
          </button>
        ) : row.deleteId && row.isSigned ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500"
            title="Подписанный документ может удалить только владелец"
          >
            <Lock className="h-3 w-3" />
            Подписан
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Вид:</span>
        <button
          onClick={() => setGroupBy("none")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            groupBy === "none"
              ? "bg-slate-900 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          Список
        </button>
        <button
          onClick={() => setGroupBy("tenant")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            groupBy === "tenant"
              ? "bg-slate-900 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          По контрагенту
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium">
            Выбрано: {selected.size} {selected.size === 1 ? "документ" : "документов"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-300 hover:text-white"
            >
              Снять выделение
            </button>
            <button
              onClick={downloadArchive}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              Скачать ZIP
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="w-10 px-3 py-3 text-center">
                {selectableRows.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === selectableRows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < selectableRows.length
                    }}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                )}
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Номер</th>
              {groupBy !== "tenant" && (
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Контрагент</th>
              )}
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Сумма</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Создан</th>
              <th className="px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {/* Grouped view: рендерим заголовок группы + строки */}
            {grouped !== null && grouped.map(([groupName, group]) => {
              const isCollapsed = collapsedGroups.has(groupName)
              const groupTotal = group.rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
              return (
                <>
                  <tr key={`g-${groupName}`} className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-800">
                    <td colSpan={8} className="px-3 py-2">
                      <button
                        onClick={() => toggleGroup(groupName)}
                        className="w-full flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:text-blue-400"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <Folder className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        {group.tenantId ? (
                          <Link
                            href={`/admin/tenants/${group.tenantId}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {groupName}
                          </Link>
                        ) : (
                          <span>{groupName}</span>
                        )}
                        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          <span>{group.rows.length} док.</span>
                          {groupTotal > 0 && <span>{formatMoney(groupTotal)}</span>}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed && group.rows.map((r) => {
                    const isSelected = r.generatedId ? selected.has(r.generatedId) : false
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-slate-50 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-500/10/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50"}`}
                      >
                        <td className="px-3 py-3 text-center">
                          {r.generatedId ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(r.generatedId!)}
                              className="cursor-pointer"
                            />
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                            {TYPE_LABELS[r.type] ?? r.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.number ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.period ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                          {r.totalAmount != null ? formatMoney(r.totalAmount) : "—"}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                          {new Date(r.generatedAt).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="px-5 py-3 text-right">{renderActions(r)}</td>
                      </tr>
                    )
                  })}
                </>
              )
            })}
            {/* Plain list view */}
            {grouped === null && rows.map((r) => {
              const isSelected = r.generatedId ? selected.has(r.generatedId) : false
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-500/10/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50"}`}
                >
                  <td className="px-3 py-3 text-center">
                    {r.generatedId ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(r.generatedId!)}
                        className="cursor-pointer"
                      />
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.number ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    {r.tenantId ? (
                      <Link href={`/admin/tenants/${r.tenantId}`} className="hover:text-blue-600 dark:text-blue-400 hover:underline">
                        {r.tenantName}
                      </Link>
                    ) : (
                      r.tenantName
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.period ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">
                    {r.totalAmount != null ? formatMoney(r.totalAmount) : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {new Date(r.generatedAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-5 py-3 text-right">{renderActions(r)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{emptyHint}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
