"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Download, FileText, Archive, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatMoney } from "@/lib/utils"

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "Акт оказанных услуг",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const TYPE_COLORS: Record<string, string> = {
  CONTRACT: "bg-blue-50 text-blue-700",
  INVOICE: "bg-emerald-50 text-emerald-700",
  ACT: "bg-purple-50 text-purple-700",
  RECONCILIATION: "bg-amber-50 text-amber-700",
  HANDOVER: "bg-slate-100 text-slate-700",
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
}

export function DocumentsTable({ rows, emptyHint }: { rows: DocRow[]; emptyHint: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

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

  return (
    <div className="space-y-3">
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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
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
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Номер</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Контрагент</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Сумма</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Создан</th>
              <th className="px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = r.generatedId ? selected.has(r.generatedId) : false
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 transition-colors ${isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}
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
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 text-slate-700"}`}>
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{r.number ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {r.tenantId ? (
                      <Link href={`/admin/tenants/${r.tenantId}`} className="hover:text-blue-600 hover:underline">
                        {r.tenantName}
                      </Link>
                    ) : (
                      r.tenantName
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.period ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-slate-700 font-medium">
                    {r.totalAmount != null ? formatMoney(r.totalAmount) : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {new Date(r.generatedAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.downloadHref ? (
                      <a
                        href={r.downloadHref}
                        download
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 hover:bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        <Download className="h-3 w-3" />
                        Скачать
                      </a>
                    ) : (
                      <Link
                        href={`/admin/tenants/${r.tenantId}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Открыть →
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{emptyHint}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
