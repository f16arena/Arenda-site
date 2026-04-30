"use client"

import { useState, useTransition } from "react"
import { Upload, Check, AlertTriangle, Save } from "lucide-react"
import { toast } from "sonner"
import { parseBankCsv, applyBankImport, type ParsedRow } from "@/app/actions/bank-import"
import { useRouter } from "next/navigation"

type Tenant = { id: string; companyName: string; bin: string | null; iin: string | null }

export function ImportClient({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      startTransition(async () => {
        try {
          const result = await parseBankCsv(reader.result as string)
          setRows(result.rows)
          setErrors(result.errors)
          if (result.errors.length === 0) {
            toast.success(`Распознано ${result.rows.length} строк`)
          } else {
            toast.error(result.errors[0])
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Не удалось обработать файл")
        }
      })
    }
    // Пробуем как UTF-8, fallback на Windows-1251
    reader.readAsText(file, "UTF-8")
  }

  function setMatch(index: number, tenantId: string) {
    const t = tenants.find((x) => x.id === tenantId)
    setRows((prev) => prev.map((r, i) =>
      i === index
        ? { ...r, matchedTenantId: tenantId || undefined, matchedTenantName: t?.companyName, matchType: tenantId ? "MANUAL" : null }
        : r
    ))
  }

  function handleApply() {
    const matched = rows.filter((r) => r.matchedTenantId)
    if (matched.length === 0) {
      toast.error("Нет сопоставленных платежей")
      return
    }
    if (!confirm(`Импортировать ${matched.length} платежей?`)) return

    startTransition(async () => {
      try {
        const result = await applyBankImport(matched.map((r) => ({
          date: r.date,
          amount: r.amount,
          tenantId: r.matchedTenantId!,
          description: r.description,
        })))
        toast.success(`Импортировано: ${result.created} платежей`)
        router.push("/admin/finances")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
          <Upload className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Выберите CSV-файл выписки</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">
            Поддерживаются форматы Kaspi Business, Halyk Online, и стандартный CSV.<br />
            Колонки: <span className="font-mono">Дата, Сумма, Назначение</span>
          </p>
          <label className="inline-block cursor-pointer">
            <span className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white">
              Выбрать файл
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-slate-700 dark:text-slate-300 font-medium">{rows.length} строк</span>
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400">{rows.filter((r) => r.matchedTenantId).length} сопоставлено</span>
              {" · "}
              <span className="text-amber-600 dark:text-amber-400">{rows.filter((r) => !r.matchedTenantId).length} требует ручного выбора</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRows([])}
                className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
              >
                Очистить
              </button>
              <button
                onClick={handleApply}
                disabled={pending || rows.filter((r) => r.matchedTenantId).length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {pending ? "..." : "Применить"}
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Дата</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Сумма</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Назначение</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Арендатор</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.date}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                      {r.amount.toLocaleString("ru-RU")} ₸
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-[300px] truncate">{r.description}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={r.matchedTenantId ?? ""}
                          onChange={(e) => setMatch(i, e.target.value)}
                          className={`text-xs rounded border px-2 py-1 ${
                            r.matchedTenantId ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10" : "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
                          }`}
                        >
                          <option value="">— не выбран —</option>
                          {tenants.map((t) => (
                            <option key={t.id} value={t.id}>{t.companyName}</option>
                          ))}
                        </select>
                        {r.matchType && (
                          <span title={`Авто-матч по ${r.matchType}`} className="text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                            <Check className="h-3 w-3" />
                            {r.matchType}
                          </span>
                        )}
                        {!r.matchedTenantId && (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
