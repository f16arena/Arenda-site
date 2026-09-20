import { ListOrdered } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { updateDocNumberStart } from "@/app/actions/organization-settings"
import { Button } from "@/components/ui/button"

type Row = { type: "CONTRACT" | "ACT" | "INVOICE" | "RECONCILIATION"; start: number | null; last: number | null; next: string }

const LABEL: Record<Row["type"], string> = {
  CONTRACT: "Договор аренды",
  ACT: "АВР (акт выполненных работ)",
  INVOICE: "Счёт на оплату",
  RECONCILIATION: "Акт сверки",
}

/**
 * С какого номера продолжать нумерацию — чтобы номера совпадали с 1С бухгалтера
 * (ЭСФ выписываются по АВР). Нижняя граница: номер меньше уже выставленного
 * система не выдаст — дубли номеров недопустимы.
 */
export function DocNumberStartSection({ orgId, rows }: { orgId: string; rows: Row[] }) {
  return (
    <CollapsibleCard title="Нумерация АВР, счетов и актов сверки" icon={<ListOrdered className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm action={updateDocNumberStart.bind(null, orgId)} successMessage="Нумерация сохранена" className="space-y-4 p-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Если бухгалтер ведёт нумерацию в 1С — укажите, с какого номера продолжать. Номер меньше уже
          выставленного в системе не выдаётся: следующий всегда будет после последнего.
        </p>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((r) => {
            const blocked = r.start !== null && r.last !== null && r.last >= r.start
            return (
              <div key={r.type} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_140px_1fr]">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{LABEL[r.type]}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {r.last !== null ? `последний выставленный: №${String(r.last).padStart(3, "0")}` : "ещё не выставлялись"}
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">Начать с №</span>
                  <input
                    name={r.type}
                    inputMode="numeric"
                    defaultValue={r.start ?? ""}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <p className={`text-xs ${blocked ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
                  Следующий номер: <b className="tabular-nums text-slate-900 dark:text-slate-100">№{r.next}</b>
                  {blocked && " — в системе уже есть номер больше стартового"}
                </p>
              </div>
            )
          })}
        </div>
        <Button type="submit" size="sm">Сохранить</Button>
      </ServerForm>
    </CollapsibleCard>
  )
}
