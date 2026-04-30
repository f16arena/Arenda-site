"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Upload, Loader2, AlertCircle, Check, X, FileSpreadsheet } from "lucide-react"
import {
  previewTenantImport,
  applyTenantImport,
  type PreviewResult,
  type ParsedTenantRow,
  type ImportResult,
} from "@/app/actions/import-tenants"

type Stage = "select" | "preview" | "applying" | "done"

export function ImportTenantsClient() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("select")
  const [pending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  function handleFile(file: File | null | undefined) {
    if (!file) return
    setFileName(file.name)
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      try {
        const p = await previewTenantImport(fd)
        setPreview(p)
        setStage("preview")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка чтения файла")
        setFileName(null)
        setPreview(null)
      }
    })
  }

  function applyImport() {
    if (!preview) return
    setStage("applying")
    startTransition(async () => {
      try {
        const r = await applyTenantImport(preview.validRows)
        setResult(r)
        setStage("done")
        if (r.created > 0) toast.success(`Создано: ${r.created}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка импорта")
        setStage("preview")
      }
    })
  }

  function reset() {
    setStage("select")
    setFileName(null)
    setPreview(null)
    setResult(null)
  }

  // ── 1. Выбор файла ────────────────────────────────────────────
  if (stage === "select") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
        <label
          className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            pending ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={pending}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            {pending ? (
              <>
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                <p className="text-sm font-medium text-blue-900">Парсим файл...</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Перетащите файл сюда или нажмите чтобы выбрать</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Поддерживаются .xlsx, .xls, .csv до 10 МБ</p>
              </>
            )}
          </div>
        </label>
      </div>
    )
  }

  // ── 2. Превью ─────────────────────────────────────────────────
  if (stage === "preview" && preview) {
    if (preview.unmappedFields.length > 0) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900 mb-1">Не найдены обязательные колонки</p>
              <p className="text-sm text-red-800 mb-3">
                В вашем файле не найдены: <b>{preview.unmappedFields.join(", ")}</b>.
                Скачайте наш шаблон сверху и перенесите данные с правильными названиями колонок.
              </p>
              <button onClick={reset} className="text-xs text-red-700 hover:underline font-medium">Загрузить другой файл</button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Сводка */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <span className="font-medium text-slate-900 dark:text-slate-100">{fileName}</span>
              <button onClick={reset} className="text-slate-400 dark:text-slate-500 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Всего строк" value={preview.totalRows} />
            <Stat label="Готовы к импорту" value={preview.validRows.length} color="emerald" />
            <Stat label="С ошибками" value={preview.invalidRows.length} color={preview.invalidRows.length > 0 ? "red" : "slate"} />
          </div>
        </div>

        {/* Превью таблицы */}
        {preview.validRows.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Превью (первые 10 строк из {preview.validRows.length})
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <Th>Стр.</Th>
                    <Th>Компания</Th>
                    <Th>Тип</Th>
                    <Th>БИН</Th>
                    <Th>Контакт</Th>
                    <Th>Помещение</Th>
                    <Th>Ставка</Th>
                    <Th>Замечания</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.validRows.slice(0, 10).map((r) => (
                    <tr key={r.rowIndex} className="border-t border-slate-50">
                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{r.rowIndex}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{r.data.companyName}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.data.legalType}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.data.bin || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                        {r.data.contactName}
                        {r.data.phone && <div className="text-[10px] text-slate-400 dark:text-slate-500">{r.data.phone}</div>}
                        {r.data.email && <div className="text-[10px] text-slate-400 dark:text-slate-500">{r.data.email}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.data.spaceNumber || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.data.rate ? `${r.data.rate} ₸` : "—"}</td>
                      <td className="px-3 py-2 text-amber-600">
                        {r.warnings.length > 0 && (
                          <span title={r.warnings.join("\n")}>
                            ⚠ {r.warnings.length}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ошибки */}
        {preview.invalidRows.length > 0 && (
          <details className="bg-red-50 border border-red-200 rounded-xl p-4">
            <summary className="text-sm font-medium text-red-900 cursor-pointer">
              Строки с ошибками ({preview.invalidRows.length}) — будут пропущены
            </summary>
            <ul className="mt-3 space-y-1 text-xs">
              {preview.invalidRows.slice(0, 50).map((e) => (
                <li key={e.rowIndex} className="text-red-700">
                  Строка <span className="font-mono">{e.rowIndex}</span>: {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Действия */}
        <div className="flex justify-end gap-2">
          <button onClick={reset} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
            Отмена
          </button>
          <button
            onClick={applyImport}
            disabled={preview.validRows.length === 0 || pending}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white inline-flex items-center gap-2"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Импортировать {preview.validRows.length} строк
          </button>
        </div>
      </div>
    )
  }

  // ── 3. Применяем ──────────────────────────────────────────────
  if (stage === "applying") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
        <Loader2 className="h-10 w-10 text-blue-600 mx-auto mb-3 animate-spin" />
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Сохраняем в БД...</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">Не закрывайте страницу</p>
      </div>
    )
  }

  // ── 4. Результат ──────────────────────────────────────────────
  if (stage === "done" && result) {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Check className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-900">Импорт завершён</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Создано" value={result.created} color="emerald" />
            <Stat label="Пропущено (дубли)" value={result.skipped} />
            <Stat label="Ошибок" value={result.errors.length} color={result.errors.length > 0 ? "red" : "slate"} />
          </div>
        </div>

        {result.errors.length > 0 && (
          <details className="bg-red-50 border border-red-200 rounded-xl p-4">
            <summary className="text-sm font-medium text-red-900 cursor-pointer">
              Ошибки при импорте ({result.errors.length})
            </summary>
            <ul className="mt-3 space-y-1 text-xs">
              {result.errors.map((e) => (
                <li key={e.rowIndex} className="text-red-700">
                  Строка <span className="font-mono">{e.rowIndex}</span>: {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={reset} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
            Загрузить ещё файл
          </button>
          <button
            onClick={() => router.push("/admin/tenants")}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-medium text-white"
          >
            Перейти к арендаторам →
          </button>
        </div>
      </div>
    )
  }

  return null
}

function Stat({ label, value, color }: { label: string; value: number; color?: "emerald" | "red" | "slate" }) {
  const tone = color === "emerald" ? "text-emerald-700" : color === "red" ? "text-red-700" : "text-slate-700 dark:text-slate-300"
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">{children}</th>
}
