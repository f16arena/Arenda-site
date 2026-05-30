"use client"

import { useEffect, useState } from "react"
import { FileText, Loader2, Info } from "lucide-react"
import { listParentContractsForAddendum, type ParentContractOption } from "@/app/actions/contract-addendums"
import { AddendumActions } from "./addendum-actions"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "черновик",
  SENT: "отправлен",
  VIEWED: "просмотрен",
  SIGNED_BY_TENANT: "подписан арендатором",
  SIGNED: "подписан",
  REJECTED: "отклонён",
  ARCHIVED: "архив",
}

/**
 * Конструктор доп. соглашения: СНАЧАЛА обязательно выбрать родительский договор,
 * затем оформить продление/расторжение (через AddendumActions). Без выбора договора
 * создать ДС нельзя.
 */
export function AddendumConstructor({ initialTenantId }: { embedded?: boolean; initialTenantId?: string }) {
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
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Доп. соглашение к договору</h2>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          К какому договору оформляется ДС? <span className="text-red-500">*</span>
        </label>

        {contracts === null ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка договоров…
          </div>
        ) : contracts.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            Нет основных договоров для ДС. Сначала создайте договор.
          </div>
        ) : (
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— выберите договор —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                № {c.number} · {c.tenantName} · {STATUS_LABEL[c.status] ?? c.status}
                {c.endDate ? ` · до ${new Date(c.endDate).toLocaleDateString("ru-RU")}` : ""}
              </option>
            ))}
          </select>
        )}

        {!sel && contracts && contracts.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Info className="h-3.5 w-3.5" /> Выберите договор — без этого создать ДС нельзя.
          </p>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            ДС к договору <span className="font-semibold text-slate-900 dark:text-slate-100">№ {selected.number}</span>
            {" "}({selected.tenantName}). После создания ДС уйдёт арендатору на подпись; изменения применятся
            к договору после подписания.
          </p>
          <AddendumActions contractId={selected.id} />
        </div>
      )}
    </div>
  )
}
