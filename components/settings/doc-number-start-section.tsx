import { ListOrdered } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { updateDocNumberStart } from "@/app/actions/organization-settings"
import { Button } from "@/components/ui/button"
import { getT } from "@/lib/i18n/server"

type Row = { type: "CONTRACT" | "ACT" | "INVOICE" | "RECONCILIATION"; start: number | null; last: number | null; next: string }

// Подписи документов берём из словаря по типу — массив хранит только ключ.
const LABEL_KEY = {
  CONTRACT: "common.settings.docNumbers.docContract",
  ACT: "common.settings.docNumbers.docAct",
  INVOICE: "common.settings.docNumbers.docInvoice",
  RECONCILIATION: "common.settings.docNumbers.docReconciliation",
} as const

/**
 * С какого номера продолжать нумерацию — чтобы номера совпадали с 1С бухгалтера
 * (ЭСФ выписываются по АВР). Нижняя граница: номер меньше уже выставленного
 * система не выдаст — дубли номеров недопустимы.
 */
export async function DocNumberStartSection({ orgId, rows }: { orgId: string; rows: Row[] }) {
  const { t } = await getT()
  return (
    <CollapsibleCard title={t("common.settings.docNumbers.title")} icon={<ListOrdered className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm action={updateDocNumberStart.bind(null, orgId)} successMessage={t("common.settings.docNumbers.saved")} className="space-y-4 p-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("common.settings.docNumbers.hint")}
        </p>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((row) => {
            const blocked = row.start !== null && row.last !== null && row.last >= row.start
            return (
              <div key={row.type} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_140px_1fr]">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(LABEL_KEY[row.type])}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {row.last !== null
                      ? t("common.settings.docNumbers.last", { number: String(row.last).padStart(3, "0") })
                      : t("common.settings.docNumbers.never")}
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">{t("common.settings.docNumbers.startFrom")}</span>
                  <input
                    name={row.type}
                    inputMode="numeric"
                    defaultValue={row.start ?? ""}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <p className={`text-xs ${blocked ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
                  {t("common.settings.docNumbers.nextNumber")} <b className="tabular-nums text-slate-900 dark:text-slate-100">№{row.next}</b>
                  {blocked && t("common.settings.docNumbers.blocked")}
                </p>
              </div>
            )
          })}
        </div>
        <Button type="submit" size="sm">{t("common.actions.save")}</Button>
      </ServerForm>
    </CollapsibleCard>
  )
}
