"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { updatePenaltySettings } from "@/app/actions/organization-settings"
import { Button } from "@/components/ui/button"

interface Props {
  organization: { id: string; defaultPenaltyPercent: number; penaltyGraceDays: number }
}

const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"

/** Настройки пени за просрочку: ставка %/день + льготный период. */
export function PenaltySettingsSection({ organization }: Props) {
  const [percent, setPercent] = useState(organization.defaultPenaltyPercent)
  const [grace, setGrace] = useState(organization.penaltyGraceDays)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <AlertTriangle className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Пеня за просрочку</h2>
      </div>
      <ServerForm
        action={updatePenaltySettings.bind(null, organization.id)}
        successMessage="Настройки пени сохранены"
        className="p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Пеня, %/день (по умолчанию)</label>
            <input name="defaultPenaltyPercent" type="number" min={0} max={10} step={0.1} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className={inputCls} />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">У арендатора может быть своя ставка — она переопределяет это значение.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Льготный период, дней</label>
            <input name="penaltyGraceDays" type="number" min={0} max={60} step={1} value={grace} onChange={(e) => setGrace(Number(e.target.value))} className={inputCls} />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Столько дней после срока оплаты пеня ещё НЕ начисляется.</p>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-blue-800 dark:text-blue-200">
          Пеня начисляется <b>только на аренду и услуги</b> (не на депозит). Старт — после <b>дня оплаты</b> арендатора (обычно 10-е число) плюс льготный период. Потолок — <b>10%</b> от суммы начисления. Отменить пеню можно на странице «Финансы».
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm">Сохранить</Button>
        </div>
      </ServerForm>
    </div>
  )
}
