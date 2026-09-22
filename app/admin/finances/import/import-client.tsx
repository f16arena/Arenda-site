"use client"

import { useState, useTransition } from "react"
import { Upload, Check, AlertTriangle, Save } from "lucide-react"
import { toast } from "sonner"
import { parseBankCsv, applyBankImport, type ParsedRow } from "@/app/actions/bank-import"
import { useRouter } from "next/navigation"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Tenant = { id: string; companyName: string; bin: string | null; iin: string | null }

export function ImportClient({ tenants, canApply = false }: { tenants: Tenant[]; canApply?: boolean }) {
  const router = useRouter()
  const { t, tp } = useT()
  const locale = useLocale()
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
            toast.success(t("adminFinance.import.parsed", { count: result.rows.length }))
          } else {
            toast.error(result.errors[0])
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t("adminFinance.import.parseFailed"))
        }
      })
    }
    // Пробуем как UTF-8, fallback на Windows-1251
    reader.readAsText(file, "UTF-8")
  }

  function setMatch(index: number, tenantId: string) {
    // Найденный арендатор назван tenant, а не t: иначе перекрывает переводчик.
    const tenant = tenants.find((x) => x.id === tenantId)
    setRows((prev) => prev.map((r, i) =>
      i === index
        ? { ...r, matchedTenantId: tenantId || undefined, matchedTenantName: tenant?.companyName, matchType: tenantId ? "MANUAL" : null }
        : r
    ))
  }

  function handleApply() {
    const matched = rows.filter((r) => r.matchedTenantId)

    startTransition(async () => {
      try {
        const result = await applyBankImport(matched.map((r) => ({
          date: r.date,
          amount: r.amount,
          tenantId: r.matchedTenantId!,
          description: r.description,
        })))
        const chargesNote = result.chargesPaid > 0
          ? t("adminFinance.import.importedCharges", { count: result.chargesPaid })
          : ""
        toast.success(t("adminFinance.import.imported", { count: result.created }) + chargesNote)
        router.push("/admin/finances")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminFinance.import.importFailed"))
      }
    })
  }

  const matchedCount = rows.filter((r) => r.matchedTenantId).length

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
          <Upload className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("adminFinance.import.pickFile")}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {t("adminFinance.import.formats")}<br />
            <span className="font-mono">{t("adminFinance.import.columns")}</span>
          </p>
          <label className="inline-block cursor-pointer">
            <span className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white">
              {t("adminFinance.import.choose")}
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
              <span className="text-slate-700 dark:text-slate-300 font-medium">{t("adminFinance.import.rows", { count: rows.length })}</span>
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400">{t("adminFinance.import.matched", { count: matchedCount })}</span>
              {" · "}
              <span className="text-amber-600 dark:text-amber-400">{t("adminFinance.import.unmatched", { count: rows.length - matchedCount })}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRows([])}>
                {t("adminFinance.import.clear")}
              </Button>
              {canApply && (
              <ConfirmDialog
                title={tp("adminFinance.import.applyTitle", matchedCount)}
                description={t("adminFinance.import.applyText")}
                confirmLabel={t("adminFinance.import.apply")}
                onConfirm={handleApply}
                trigger={
                  <button
                    disabled={pending || matchedCount === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {pending ? "..." : t("adminFinance.import.applyShort")}
                  </button>
                }
              />
              )}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <Card className="block overflow-x-auto py-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.import.date")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.import.amount")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.import.purpose")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.import.tenant")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{r.date}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                      {formatMoneyL(locale, r.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 max-w-[300px] truncate">{r.description}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={r.matchedTenantId ?? ""}
                          onChange={(e) => setMatch(i, e.target.value)}
                          className={`text-xs rounded border px-2 py-1 ${
                            r.matchedTenantId ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10" : "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
                          }`}
                        >
                          <option value="">{t("adminFinance.import.notMatched")}</option>
                          {tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
                          ))}
                        </select>
                        {r.matchType && (
                          <span title={t("adminFinance.import.autoMatch", { type: r.matchType })} className="text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
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
          </Card>
        </>
      )}
    </div>
  )
}
