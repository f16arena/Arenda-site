"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Upload, Loader2, AlertCircle, Check, X, FileSpreadsheet } from "lucide-react"
import { useT } from "@/lib/i18n/client"
import { formatDateShortL } from "@/lib/i18n/format"
import {
  previewContractImport,
  applyContractImport,
  type ContractPreviewResult,
  type ContractImportResult,
} from "@/app/actions/import-contracts"

type Stage = "select" | "preview" | "applying" | "done"

// Статус договора в файле распознаётся кодом, подпись — из словаря.
// Отдельно от domain.statuses: здесь REJECTED значит «расторгнут».
const STATUS_KEYS = ["SIGNED", "DRAFT", "EXPIRED", "REJECTED"] as const
type StatusKey = (typeof STATUS_KEYS)[number]

export function ImportContractsClient() {
  const router = useRouter()
  const { t, locale } = useT()
  const [stage, setStage] = useState<Stage>("select")
  const [pending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ContractPreviewResult | null>(null)
  const [result, setResult] = useState<ContractImportResult | null>(null)

  const statusLabel = (value: string) =>
    STATUS_KEYS.includes(value as StatusKey)
      ? t(`adminSettings.import.file.contractStatuses.${value as StatusKey}`)
      : value

  function handleFile(file: File | null | undefined) {
    if (!file) return
    setFileName(file.name)
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      try {
        const p = await previewContractImport(fd)
        setPreview(p)
        setStage("preview")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminSettings.import.file.readError"))
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
        const r = await applyContractImport(preview.validRows)
        setResult(r)
        setStage("done")
        if (r.created > 0) toast.success(t("adminSettings.import.file.createdContracts", { count: r.created }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminSettings.import.file.importError"))
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

  if (stage === "select") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
        <label className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${pending ? "border-blue-400 bg-blue-50 dark:bg-blue-500/10" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10"}`}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFile(e.target.files?.[0])} disabled={pending} className="hidden" />
          <div className="flex flex-col items-center gap-3">
            {pending ? (
              <>
                <Loader2 className="h-10 w-10 text-blue-600 dark:text-blue-400 animate-spin" />
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{t("adminSettings.import.file.parsing")}</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("adminSettings.import.file.drop")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("adminSettings.import.file.formats")}</p>
              </>
            )}
          </div>
        </label>
      </div>
    )
  }

  if (stage === "preview" && preview) {
    if (preview.unmappedFields.length > 0) {
      return (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">{t("adminSettings.import.file.missingContract")}</p>
              <p className="text-sm text-red-800 dark:text-red-200 mb-3">{t("adminSettings.import.file.missingContractText")}</p>
              <button onClick={reset} className="text-xs text-red-700 dark:text-red-300 hover:underline font-medium">{t("adminSettings.import.file.loadAnother")}</button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <span className="font-medium text-slate-900 dark:text-slate-100">{fileName}</span>
              <button onClick={reset} aria-label={t("adminSettings.import.file.reset")} className="text-slate-400 dark:text-slate-500 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("adminSettings.import.file.totalRows")} value={preview.totalRows} />
            <Stat label={t("adminSettings.import.file.readyToImport")} value={preview.validRows.length} color="emerald" />
            <Stat label={t("adminSettings.import.file.withErrors")} value={preview.invalidRows.length} color={preview.invalidRows.length > 0 ? "red" : "slate"} />
          </div>
        </div>

        {preview.validRows.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("adminSettings.import.file.previewShort", { count: preview.validRows.length })}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <Th>{t("adminSettings.import.file.cols.row")}</Th>
                    <Th>{t("adminSettings.import.file.cols.number")}</Th>
                    <Th>{t("adminSettings.import.file.cols.tenant")}</Th>
                    <Th>{t("adminSettings.import.file.cols.period")}</Th>
                    <Th>{t("adminSettings.import.file.cols.status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.validRows.slice(0, 10).map((r) => (
                    <tr key={r.rowIndex} className="border-t border-slate-50">
                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{r.rowIndex}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{r.data.number}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.data.tenantCompany}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {r.data.startDate ? formatDateShortL(locale, r.data.startDate) : "—"}
                        {" – "}
                        {r.data.endDate ? formatDateShortL(locale, r.data.endDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{statusLabel(r.data.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview.invalidRows.length > 0 && (
          <details className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
            <summary className="text-sm font-medium text-red-900 dark:text-red-200 cursor-pointer">{t("adminSettings.import.file.errorRows", { count: preview.invalidRows.length })}</summary>
            <ul className="mt-3 space-y-1 text-xs">
              {preview.invalidRows.slice(0, 50).map((e) => (
                <li key={e.rowIndex} className="text-red-700 dark:text-red-300">{t("adminSettings.import.file.row")} <span className="font-mono">{e.rowIndex}</span>: {e.error}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={reset} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">{t("adminSettings.import.file.cancel")}</button>
          <button onClick={applyImport} disabled={preview.validRows.length === 0 || pending} className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white inline-flex items-center gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("adminSettings.import.file.importShort", { count: preview.validRows.length })}
          </button>
        </div>
      </div>
    )
  }

  if (stage === "applying") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
        <Loader2 className="h-10 w-10 text-blue-600 dark:text-blue-400 mx-auto mb-3 animate-spin" />
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("adminSettings.import.file.saving")}</p>
      </div>
    )
  }

  if (stage === "done" && result) {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{t("adminSettings.import.file.done")}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("adminSettings.import.file.created")} value={result.created} color="emerald" />
            <Stat label={t("adminSettings.import.file.skipped")} value={result.skipped} />
            <Stat label={t("adminSettings.import.file.errors")} value={result.errors.length} color={result.errors.length > 0 ? "red" : "slate"} />
          </div>
        </div>
        {result.errors.length > 0 && (
          <details className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
            <summary className="text-sm font-medium text-red-900 dark:text-red-200 cursor-pointer">{t("adminSettings.import.file.errorsShort", { count: result.errors.length })}</summary>
            <ul className="mt-3 space-y-1 text-xs">
              {result.errors.map((e) => (
                <li key={e.rowIndex} className="text-red-700 dark:text-red-300">{t("adminSettings.import.file.row")} <span className="font-mono">{e.rowIndex}</span>: {e.error}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={reset} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">{t("adminSettings.import.file.loadMoreShort")}</button>
          <button onClick={() => router.push("/admin/documents")} className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-medium text-white">{t("adminSettings.import.file.goDocuments")}</button>
        </div>
      </div>
    )
  }

  return null
}

function Stat({ label, value, color }: { label: string; value: number; color?: "emerald" | "red" | "slate" }) {
  const tone = color === "emerald" ? "text-emerald-700 dark:text-emerald-300" : color === "red" ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-300"
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">{children}</th>
}
