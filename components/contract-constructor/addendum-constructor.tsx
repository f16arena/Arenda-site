"use client"

import { useEffect, useState } from "react"
import { FileText, Loader2, Info } from "lucide-react"
import { listParentContractsForAddendum, type ParentContractOption } from "@/app/actions/contract-addendums"
import { useT } from "@/lib/i18n/client"
import type { Messages } from "@/lib/i18n/messages"
import type { TextKey } from "@/lib/i18n/translate"
import { formatDateShortL } from "@/lib/i18n/format"
import { AddendumActions } from "./addendum-actions"

/**
 * Конструктор доп. соглашения: СНАЧАЛА обязательно выбрать родительский договор,
 * затем оформить продление/расторжение (через AddendumActions). Без выбора договора
 * создать ДС нельзя.
 */
export function AddendumConstructor({ initialTenantId }: { embedded?: boolean; initialTenantId?: string }) {
  const { t, locale } = useT()
  const [contracts, setContracts] = useState<ParentContractOption[] | null>(null)
  const [sel, setSel] = useState("")

  useEffect(() => {
    listParentContractsForAddendum()
      .then((rows) => {
        const filtered = initialTenantId ? rows.filter((r) => r.tenantId === initialTenantId) : rows
        setContracts(filtered)
        if (filtered.length === 1) setSel(filtered[0].id)
      })
      .catch(() => setContracts([]))
  }, [initialTenantId])

  const selected = contracts?.find((c) => c.id === sel)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("adminDocs.constructor.addendum.constructorTitle")}</h2>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          {t("adminDocs.constructor.addendum.parentQuestion")} <span className="text-red-500">*</span>
        </label>

        {contracts === null ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("adminDocs.constructor.addendum.loadingContracts")}
          </div>
        ) : contracts.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {t("adminDocs.constructor.addendum.noContracts")}
          </div>
        ) : (
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">{t("adminDocs.constructor.addendum.pickContract")}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                № {c.number} · {c.tenantName} · {t(`common.contractStatus.${c.status}` as TextKey<Messages>)}
                {c.endDate ? t("adminDocs.constructor.addendum.until", { date: formatDateShortL(locale, c.endDate) }) : ""}
              </option>
            ))}
          </select>
        )}

        {!sel && contracts && contracts.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Info className="h-3.5 w-3.5" /> {t("adminDocs.constructor.addendum.pickContractHint")}
          </p>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            {t("adminDocs.constructor.addendum.selectedBefore")}
            <span className="font-semibold text-slate-900 dark:text-slate-100">№ {selected.number}</span>
            {t("adminDocs.constructor.addendum.selectedAfter", { tenant: selected.tenantName })}
          </p>
          <AddendumActions contractId={selected.id} />
        </div>
      )}
    </div>
  )
}
